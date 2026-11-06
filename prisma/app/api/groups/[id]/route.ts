import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { nameKey, normName } from "@/lib/houseMode";
import { canManageGroup, jerr, newGroupCode } from "@/lib/orderLogic";

// PATCH /api/groups/:id
//   admin:                  { name?, coordinatorId?, houseId? }
//   coordinator of group / admin: { codeAction: "regenerate" } | { codeActive: boolean }   (the secret code)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const group = await db.group.findUnique({ where: { id: params.id } });
  if (!group) return jerr("not found", 404);
  const b = await req.json().catch(() => ({}));
  const data: Record<string, any> = {};

  if (b.name !== undefined || b.coordinatorId !== undefined || b.houseId !== undefined) {
    if (!can(me.role, "groups.manage")) return jerr("forbidden", 403);
    if (b.name !== undefined) {
      const name = String(b.name).replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name) return jerr("name required");
      if ((await db.group.findMany({})).some((x: any) => x.id !== group.id && normName(x.name) === normName(name))) return jerr("a group with that name already exists", 409);
      data.name = name; data.nameKey = nameKey(name);
    }
    if (b.coordinatorId !== undefined) {
      if (b.coordinatorId) {
        const c = await db.worker.findUnique({ where: { id: b.coordinatorId } });
        if (!c || !["coordinator", "admin"].includes(c.role)) return jerr("coordinator not found", 404);
      }
      data.coordinatorId = b.coordinatorId || null;
    }
    if (b.houseId !== undefined) {
      if (b.houseId && !(await db.house.findUnique({ where: { id: b.houseId } }))) return jerr("house not found", 404);
      data.houseId = b.houseId || null;
    }
  }
  if (b.codeAction !== undefined || b.codeActive !== undefined) {
    if (!can(me.role, "groups.code") || !(await canManageGroup(me, group.id))) return jerr("forbidden", 403);
    if (b.codeAction === "regenerate") data.accessCode = await newGroupCode();
    else if (b.codeAction !== undefined) return jerr("invalid code action");
    if (typeof b.codeActive === "boolean") data.codeActive = b.codeActive;
  }
  if (!Object.keys(data).length) return jerr("nothing to change");

  try {
    await db.group.update({ where: { id: group.id }, data });
  } catch (e: any) {
    if (e?.code === "P2002") return jerr("a group with that name already exists", 409);
    throw e;
  }
  if (data.accessCode) await logAudit(req, "group", group.id, "code", "New access code for group {name}", { name: group.name });
  else if (typeof data.codeActive === "boolean") await logAudit(req, "group", group.id, "code", data.codeActive ? "Switched on the access code of group {name}" : "Switched off the access code of group {name}", { name: group.name });
  else await logAudit(req, "group", group.id, "update", "Edited group {name}", { name: data.name ?? group.name });
  return NextResponse.json({ ok: true });
}

// DELETE /api/groups/:id — admin. Refused when the group already has requests or orders (history); switch its code off instead.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  if (!can(me.role, "groups.manage")) return jerr("forbidden", 403);
  const group = await db.group.findUnique({ where: { id: params.id } });
  if (!group) return jerr("not found", 404);
  const history = (await db.studentRequest.count({ where: { groupId: group.id } })) + (await db.order.count({ where: { groupId: group.id } }));
  if (history > 0) return jerr("has history", 409);
  await db.worker.deleteMany({ where: { groupId: group.id, role: "student" } });
  await db.group.delete({ where: { id: group.id } });
  await logAudit(req, "group", group.id, "delete", "Deleted group {name}", { name: group.name });
  return NextResponse.json({ ok: true });
}
