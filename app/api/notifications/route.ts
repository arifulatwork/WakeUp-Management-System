import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

// GET  /api/notifications  -> my latest 50 notifications (newest first) + unread count
// POST /api/notifications  -> mark all of mine as read
export async function GET(req: NextRequest) {
  const s = await currentSession(req);
  if (!s) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const rows = await db.notification.findMany({
    where: { workerId: s.workerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const items = rows.map((r: any) => ({
    id: r.id, key: r.key, params: r.params ?? {}, url: r.url ?? null,
    read: !!r.readAt, createdAt: r.createdAt,
  }));
  return NextResponse.json({ items, unread: items.filter((i: any) => !i.read).length });
}

export async function POST(req: NextRequest) {
  const s = await currentSession(req);
  if (!s) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  await db.notification.updateMany({ where: { workerId: s.workerId, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
