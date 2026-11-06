import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { canManageGroup, dietaryNames, jerr } from "@/lib/orderLogic";

// The students of one group (the people who joined with its code), and their registered dietary requirements.
// Coordinator of the group / admin can change them; managers can read.
async function allowed(req: NextRequest, groupId: string, write: boolean) {
  const me = await currentSession(req);
  if (!me) return { error: jerr("sign in required", 401) };
  if (me.role === "manager" && !write) return { me };
  if (!can(me.role, "groups.code") || !(await canManageGroup(me, groupId))) return { error: jerr("forbidden", 403) };
  return { me };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await allowed(req, params.id, false);
  if (a.error) return a.error;
  const rows = await db.worker.findMany({ where: { groupId: params.id }, orderBy: { name: "asc" } });
  return NextResponse.json(rows.filter((w: any) => w.role === "student").map((w: any) => ({ id: w.id, name: w.name, dietary: w.dietary ?? [], createdAt: w.createdAt })));
}

// PATCH { studentId, dietary: string[] } — register dietary requirements / exceptions for a student.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await allowed(req, params.id, true);
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  const s = await db.worker.findUnique({ where: { id: String(b.studentId ?? "") } });
  if (!s || s.role !== "student" || s.groupId !== params.id) return jerr("student not found", 404);
  const known = await dietaryNames();
  const dietary = Array.from(new Set((Array.isArray(b.dietary) ? b.dietary : []).map(String))).filter((d) => known.includes(d as string));
  await db.worker.update({ where: { id: s.id }, data: { dietary } });
  await logAudit(req, "group", params.id, "dietary", "Changed dietary requirements of {name}", { name: s.name });
  return NextResponse.json({ ok: true });
}

// DELETE ?studentId= — remove a student from the group (they can join again with the code unless it is switched off).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await allowed(req, params.id, true);
  if (a.error) return a.error;
  const sid = req.nextUrl.searchParams.get("studentId") ?? "";
  const s = await db.worker.findUnique({ where: { id: sid } });
  if (!s || s.role !== "student" || s.groupId !== params.id) return jerr("student not found", 404);
  const reqs = await db.studentRequest.findMany({ where: { studentId: s.id } });
  if (reqs.some((r: any) => r.status === "APPROVED")) return jerr("has history", 409); // approved requests stay on record
  for (const r of reqs) {
    await db.requestLine.deleteMany({ where: { requestId: r.id } });
    await db.studentRequest.delete({ where: { id: r.id } });
  }
  await db.worker.delete({ where: { id: s.id } });
  await logAudit(req, "group", params.id, "remove", "Removed student {name}", { name: s.name });
  return NextResponse.json({ ok: true });
}
