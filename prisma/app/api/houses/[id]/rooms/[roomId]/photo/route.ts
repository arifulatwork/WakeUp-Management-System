import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_ENABLED } from "@/lib/features";
import { isR2Ref, mediaSrc } from "@/lib/mediaRef";

// GET /api/houses/:id/rooms/:roomId/photo — the room photo as a real image file (cacheable).
// R2 reference -> redirect to /api/files/…; old base64 row -> served here. Signed-in users only (middleware).
export async function GET(req: NextRequest, { params }: { params: { id: string; roomId: string } }) {
  if (!MEDIA_ENABLED) return new NextResponse("Not found", { status: 404 });
  const row = await db.houseRoomPhoto.findUnique({ where: { id: params.roomId } });
  if (!row || row.houseId !== params.id) return new NextResponse("Not found", { status: 404 });

  if (isR2Ref(row.photo)) {
    return NextResponse.redirect(new URL(mediaSrc(row.photo), req.url), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  }
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(row.photo);
  if (!m) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
