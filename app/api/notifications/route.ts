import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

// GET  /api/notifications?limit=50  -> my latest notifications (newest first, max 200) + unread count
//                                      + hasMore (true when older ones exist)
// POST /api/notifications           -> mark all of mine as read
export async function GET(req: NextRequest) {
  const s = await currentSession(req);
  if (!s) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const asked = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 50, 1), 200);
  const rows = await db.notification.findMany({
    where: { workerId: s.workerId },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // one extra row only tells us whether there is more
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r: any) => ({
    id: r.id, key: r.key, params: r.params ?? {}, url: r.url ?? null,
    read: !!r.readAt, createdAt: r.createdAt,
  }));
  return NextResponse.json({ items, unread: items.filter((i: any) => !i.read).length, hasMore });
}

export async function POST(req: NextRequest) {
  const s = await currentSession(req);
  if (!s) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  await db.notification.updateMany({ where: { workerId: s.workerId, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
