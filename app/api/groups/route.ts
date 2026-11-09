import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { nameKey, normName } from "@/lib/houseMode";
import { groupsFor, jerr, newGroupCode } from "@/lib/orderLogic";

// GET /api/groups — the groups this person may see (admin/manager: all, coordinator: theirs, student: their own).
// The secret code is only included for the group's coordinator and admins.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const groups = await groupsFor(me);
  const students = await db.worker.findMany({ where: { role: "student" } });
  const showCode = me.role === "coordinator" || me.role === "admin";
  return NextResponse.json(groups.map((g: any) => ({
    id: g.id, name: g.name, codeActive: g.codeActive, memberLimit: g.memberLimit ?? null, createdAt: g.createdAt,
    coordinator: g.coordinator ? { id: g.coordinator.id, name: g.coordinator.name } : null,
    house: g.house ? { id: g.house.id, name: g.house.name } : null,
    studentCount: students.filter((s: any) => s.groupId === g.id).length,
    ...(showCode ? { accessCode: g.accessCode } : {}),
  })));
}

// POST /api/groups { name, coordinatorId?, houseId? } — admin creates a group; it gets its own secret code.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "groups.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return jerr("name required");
  if (b.coordinatorId) {
    const c = await db.worker.findUnique({ where: { id: b.coordinatorId } });
    if (!c || !["coordinator", "admin"].includes(c.role)) return jerr("coordinator not found", 404);
  }
  if (b.houseId && !(await db.house.findUnique({ where: { id: b.houseId } }))) return jerr("house not found", 404);
  if ((await db.group.findMany({})).some((x: any) => normName(x.name) === normName(name))) return jerr("a group with that name already exists", 409);
  try {
    const row = await db.group.create({
      data: { name, nameKey: nameKey(name), accessCode: await newGroupCode(), coordinatorId: b.coordinatorId || null, houseId: b.houseId || null },
    });
    await logAudit(req, "group", row.id, "create", "Created group {name}", { name });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return jerr("a group with that name already exists", 409);
    throw e;
  }
}
