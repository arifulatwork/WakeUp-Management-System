import { NextRequest, NextResponse } from "next/server";
import { sendPush, pushConfigured } from "@/lib/push";
import { whoIsCalling } from "@/lib/pushWho";

// POST /api/push/test { workerId? } — sends a test notification to the caller's own phones.
export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "push not configured" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const workerId = await whoIsCalling(req, body.workerId);
  if (!workerId) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  await sendPush({ workerIds: [workerId] }, "test", {}, "test");
  return NextResponse.json({ ok: true });
}
