import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_ENABLED } from "@/lib/features";

// GET /api/houses/:id/rooms/:roomId/photo — the room photo as a real image file (cacheable).
// Signed-in users only (middleware).
export async function GET(_req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  if (!MEDIA_ENABLED) return new NextResponse("Not found", { status: 404 });
  const row = await db.houseRoomPhoto.findUnique({ where: { id: params.roomId } });
  const m = row && row.houseId === params.id ? /^data:([^;,]+);base64,([\s\S]*)$/.exec(row.photo) : null;
  if (!m) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
