import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";

// PATCH /api/materials/:id
//   { action: "fulfill" }                        -> sorted
//   { action: "reopen" }                         -> back to PENDING
//   { action: "update", fields: { items, houseId } }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "materials.write");
  if (g.error) return g.error;
  const body = await req.json();
  const { action } = body;
  const LABELS: Record<string, string> = { fulfill: "Marked request as sorted", reopen: "Reopened request", update: "Edited request" };

  try {
    if (LABELS[action]) {
      const exists = await db.materialRequest.findUnique({ where: { id: params.id } });
      if (!exists) return NextResponse.json({ error: "request not found" }, { status: 404 });
      await logAudit(req, "material", params.id, action, LABELS[action]);
    }
    if (action === "fulfill") {
      const updated = await db.materialRequest.update({
        where: { id: params.id },
        data: { status: "FULFILLED", fulfilledAt: new Date() },
      });
      return NextResponse.json(updated);
    }
    if (action === "reopen") {
      const updated = await db.materialRequest.update({
        where: { id: params.id },
        data: { status: "PENDING", fulfilledAt: null },
      });
      return NextResponse.json(updated);
    }
    if (action === "update") {
      const f = body.fields ?? {};
      const data: Record<string, unknown> = {};
      if (f.items && String(f.items).trim()) data.items = String(f.items).trim();
      if (f.houseId) data.houseId = f.houseId;
      const updated = await db.materialRequest.update({
        where: { id: params.id },
        data,
        include: { house: true, requestedBy: true },
      });
      return NextResponse.json(updated);
    }
  } catch {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// DELETE /api/materials/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "materials.delete");
  if (g.error) return g.error;
  try {
    await db.materialRequest.delete({ where: { id: params.id } });
    await logAudit(req, "material", params.id, "delete", "Deleted request");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }
}
