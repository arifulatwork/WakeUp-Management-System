import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic"; // read the keys at run time, not at build time

// GET /api/push/key — the public key the phone needs to subscribe.
// 404 when notifications are not set up on the server (the button then stays hidden).
export async function GET() {
  if (!pushConfigured()) return NextResponse.json({ error: "push not configured" }, { status: 404 });
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY });
}
