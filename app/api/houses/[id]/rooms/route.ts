import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { isValidPhoto } from "@/lib/photoValidation";
import { MEDIA_ENABLED } from "@/lib/features";
import { MAX_ROOM_PHOTOS } from "@/lib/houseMode";

// Tourism check-in guide: the rooms (photo + label) of a house.
// GET  /api/houses/:id/rooms  -> [{ id, label, position }]  (no image data; each photo is its own URL)
// POST /api/houses/:id/rooms  -> { label, photo } adds a room photo (management only)

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const rows = await db.houseRoomPhoto.findMany({ where: { houseId: params.id }, orderBy: { position: "asc" } });
  return NextResponse.json(rows.map((r: any) => ({ id: r.id, label: r.label, position: r.position, createdAt: r.createdAt })));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!MEDIA_ENABLED) return NextResponse.json({ error: "photos are switched off" }, { status: 400 });

  const body = await req.json();
  const label = String(body.label ?? "").trim().slice(0, 80);
  if (!label) return NextResponse.json({ error: "room name required" }, { status: 400 });
  if (!isValidPhoto(body.photo)) return NextResponse.json({ error: "invalid photo (JPEG, PNG or WebP, max ~650 KB)" }, { status: 400 });

  const house = await db.house.findUnique({ where: { id: params.id } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });
  const existing = await db.houseRoomPhoto.findMany({ where: { houseId: params.id } });
  if (existing.length >= MAX_ROOM_PHOTOS) return NextResponse.json({ error: "too many photos" }, { status: 400 });

  const position = existing.reduce((m: number, r: any) => Math.max(m, r.position ?? 0), -1) + 1;
  const row = await db.houseRoomPhoto.create({ data: { houseId: params.id, label, photo: body.photo, position } });
  await logAudit(req, "house", params.id, "update", "Edited house {name} ({fields})", { name: house.name, fields: "checkInPhotos" });
  return NextResponse.json({ id: row.id, label: row.label, position: row.position }, { status: 201 });
}
