import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";

// PATCH  { label }  renames a room photo; DELETE removes it. Management only.
async function owned(houseId: string, roomId: string) {
  const row = await db.houseRoomPhoto.findUnique({ where: { id: roomId } });
  return row && row.houseId === houseId ? row : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!(await owned(params.id, params.roomId))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const label = String((await req.json()).label ?? "").trim().slice(0, 80);
  if (!label) return NextResponse.json({ error: "room name required" }, { status: 400 });
  const row = await db.houseRoomPhoto.update({ where: { id: params.roomId }, data: { label } });
  return NextResponse.json({ id: row.id, label: row.label, position: row.position });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!(await owned(params.id, params.roomId))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.houseRoomPhoto.delete({ where: { id: params.roomId } });
  const house = await db.house.findUnique({ where: { id: params.id } });
  await logAudit(req, "house", params.id, "update", "Edited house {name} ({fields})", { name: house?.name ?? params.id, fields: "checkInPhotos" });
  return NextResponse.json({ ok: true });
}
