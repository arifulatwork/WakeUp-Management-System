import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";

// GET /api/workers/:id — read current role fresh from the DB.
// Pages call this on every load instead of trusting a cached role,
// so a Super Admin change takes effect the moment the person reloads —
// no re-onboarding, no redeploy.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const worker = await db.worker.findUnique({ where: { id: params.id } });
  if (!worker) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { passwordHash, ...safe } = worker;
  return NextResponse.json(safe);
}

// PATCH /api/workers/:id — Super Admin reassigns a role, and/or sets
// login credentials when promoting someone to manager/coordinator/admin.
// Body: { role?, username?, password? }
//
// Requires a valid admin session cookie — this is the fix for the
// earlier gap where anyone could call this endpoint and self-promote.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { role, username, password, language } = body;

  // A person changing their own display language needs no admin rights —
  // it's the only field that can be changed without an admin session.
  const LANGS = ["en", "pt", "es", "fr", "it", "uk"];
  const languageOnly = Object.keys(body).length === 1 && !!language;
  if (languageOnly) {
    if (!LANGS.includes(language)) {
      return NextResponse.json({ error: "invalid language" }, { status: 400 });
    }
    const w = await db.worker.update({ where: { id: params.id }, data: { language } });
    return NextResponse.json({ id: w.id, language: w.language });
  }

  const g = await requirePerm(req, "staff.manage");
  if (g.error) return g.error;
  const session = g.session;

  // Nobody can strip their own Super Admin rights (that could leave nobody in charge).
  if (role && params.id === session.workerId && role !== "admin") {
    return NextResponse.json({ error: "you cannot remove your own Super Admin rights" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (language) {
    if (!LANGS.includes(language)) return NextResponse.json({ error: "invalid language" }, { status: 400 });
    data.language = language;
  }
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    data.name = String(body.name).trim();
  }
  if (body.area !== undefined) {
    if (body.area !== "CLEANING" && body.area !== "MAINTENANCE") {
      return NextResponse.json({ error: "invalid area" }, { status: 400 });
    }
    data.area = body.area;
  }

  if (role) {
    const allowed = ["worker", "manager", "coordinator", "admin"];
    if (!allowed.includes(role)) {
      return NextResponse.json({ error: "invalid role" }, { status: 400 });
    }
    data.role = role;
  }
  if (username) data.username = username;
  if (password) {
    const bcrypt = (await import("bcryptjs")).default;
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const before = await db.worker.findUnique({ where: { id: params.id } });
  const worker = await db.worker.update({ where: { id: params.id }, data });
  // Names of changed fields only — never the password itself.
  const changed = Object.keys(data).map((k) => (k === "passwordHash" ? "password" : k === "area" ? "team" : k)).join(",") || "—";
  if (role && before?.role !== role) {
    await logAudit(req, "staff", params.id, "role", "{name}: role {from} → {to}; changed {fields}",
      { name: worker.name, from: before?.role ?? "worker", to: role, fields: changed });
  } else {
    await logAudit(req, "staff", params.id, "update", "{name}: changed {fields}", { name: worker.name, fields: changed });
  }
  // Don't leak the hash back to the client.
  const { passwordHash, ...safe } = worker;
  return NextResponse.json(safe);
}

// DELETE /api/workers/:id — admin only. Their jobs go back to "unassigned".
// Refused if they have reported tickets / material requests, since those
// records must keep pointing at who raised them (audit trail).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "staff.manage");
  if (g.error) return g.error;
  const session = g.session;
  if (session.workerId === params.id) {
    return NextResponse.json({ error: "you cannot delete your own account" }, { status: 400 });
  }
  const history =
    (await db.maintenanceTicket.count({ where: { reportedById: params.id } })) +
    (await db.materialRequest.count({ where: { requestedById: params.id } }));
  if (history > 0) {
    return NextResponse.json({ error: "has history" }, { status: 409 });
  }
  await db.cleaningTask.updateMany({ where: { assignedWorkerId: params.id }, data: { assignedWorkerId: null } });
  await db.cleaningTask.updateMany({ where: { completedByWorkerId: params.id }, data: { completedByWorkerId: null } });
  await db.maintenanceTicket.updateMany({ where: { assignedWorkerId: params.id }, data: { assignedWorkerId: null } });
  const gone = await db.worker.findUnique({ where: { id: params.id } });
  await db.worker.delete({ where: { id: params.id } });
  await logAudit(req, "staff", params.id, "delete", "Removed staff member {name}", { name: gone?.name ?? params.id });
  return NextResponse.json({ ok: true });
}
