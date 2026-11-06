import { NextRequest, NextResponse } from "next/server";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { getOrdering, setOrdering } from "@/lib/settings";
import { cleanOrdering, orderingWindow } from "@/lib/ordering";
import { jerr } from "@/lib/orderLogic";

// GET /api/ordering — the ordering rules plus "is ordering open right now?" (computed on the server clock).
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return jerr("sign in required", 401);
  const config = await getOrdering();
  return NextResponse.json({ config, window: orderingWindow(config), serverTime: new Date().toISOString() });
}

// PUT /api/ordering — the Administrator configures the ordering workflow.
export async function PUT(req: NextRequest) {
  const g = await requirePerm(req, "ordering.configure");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  if (Array.isArray(b.orderingDays) && !b.orderingDays.length) return jerr("choose at least one ordering day");
  if (b.cutoffTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.cutoffTime))) return jerr("cut-off time must look like 18:00");
  const config = cleanOrdering({ ...(await getOrdering()), ...b });
  await setOrdering(config);
  await logAudit(req, "setting", null, "ordering", "Changed the ordering rules", {});
  return NextResponse.json({ config, window: orderingWindow(config) });
}
