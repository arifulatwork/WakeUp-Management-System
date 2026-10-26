import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { MEDIA_ENABLED } from "@/lib/features";
import { isValidPhoto } from "@/lib/photoValidation";
import { MAX_ROOM_PHOTOS } from "@/lib/houseMode";

// GET /api/houses/:id/rooms — the check-in guide's rooms (id + label only; the photo itself is at …/:roomId/photo).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!MEDIA_ENABLED) return NextResponse.json([]);
  const rows = await db.houseRoomPhoto.findMany({ where: { houseId: params.id }, orderBy: { position: "asc" } });
  return NextResponse.json(rows.map((r: any) => ({ id: r.id, label: r.label, position: r.position })));
}

// POST /api/houses/:id/rooms  { label, photo }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "houses.edit");
  if (g.error) return g.error;
  if (!MEDIA_ENABLED) return NextResponse.json({ error: "photos are switched off" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!isValidPhoto(body.photo)) return NextResponse.json({ error: "invalid photo (JPEG, PNG or WebP, max ~650 KB)" }, { status: 400 });
  const house = await db.house.findUnique({ where: { id: params.id } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });
  const count = await db.houseRoomPhoto.count({ where: { houseId: params.id } });
  if (count >= MAX_ROOM_PHOTOS) return NextResponse.json({ error: "too many photos" }, { status: 409 });
  const row = await db.houseRoomPhoto.create({ data: { houseId: params.id, label, photo: body.photo, position: count } });
  return NextResponse.json({ id: row.id, label: row.label, position: row.position }, { status: 201 });
}
