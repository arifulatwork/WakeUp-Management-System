import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";

async function find(params: { id: string; roomId: string }) {
  const row = await db.houseRoomPhoto.findUnique({ where: { id: params.roomId } });
  return row && row.houseId === params.id ? row : null;
}

// PATCH /api/houses/:id/rooms/:roomId  { label }
export async function PATCH(req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!(await find(params))) return NextResponse.json({ error: "room not found" }, { status: 404 });
  const label = String((await req.json().catch(() => ({}))).label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  const row = await db.houseRoomPhoto.update({ where: { id: params.roomId }, data: { label } });
  return NextResponse.json({ id: row.id, label: row.label, position: row.position });
}

// DELETE /api/houses/:id/rooms/:roomId
export async function DELETE(req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!(await find(params))) return NextResponse.json({ error: "room not found" }, { status: 404 });
  await db.houseRoomPhoto.delete({ where: { id: params.roomId } });
  return NextResponse.json({ ok: true });
}
