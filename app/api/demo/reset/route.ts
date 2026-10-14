import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/db";

// POST /api/demo/reset — puts the demo data back to its starting state.
// Only exists in demo mode.
export async function POST() {
  if (!DEMO_MODE) return NextResponse.json({ error: "not in demo mode" }, { status: 404 });
  const { resetDemo } = await import("@/lib/mockDb");
  resetDemo();
  return NextResponse.json({ ok: true });
}
