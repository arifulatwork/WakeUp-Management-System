import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushConfigured } from "@/lib/push";
import { whoIsCalling } from "@/lib/pushWho";

// POST   /api/push/subscribe  { workerId?, subscription }  -> remember this phone
// DELETE /api/push/subscribe  { endpoint }                  -> forget it
export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "push not configured" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 ||
      typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const workerId = await whoIsCalling(req, body.workerId);
  if (!workerId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const existing = await db.pushSubscription.findUnique({ where: { endpoint } });
  if (existing) {
    await db.pushSubscription.update({ where: { endpoint }, data: { workerId, p256dh, auth } });
  } else {
    await db.pushSubscription.create({ data: { workerId, endpoint, p256dh, auth } });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (typeof endpoint !== "string") return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await db.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
