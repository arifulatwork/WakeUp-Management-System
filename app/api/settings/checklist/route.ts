import { NextRequest, NextResponse } from "next/server";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanChecklist, getChecklistDefaults, setChecklistDefaults } from "@/lib/settings";

// GET /api/settings/checklist -> { items: string[] }  (any signed-in person: used to pre-fill new tasks)
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  return NextResponse.json({ items: await getChecklistDefaults() });
}

// PUT /api/settings/checklist  { items: string[] }  (Super Admin only)
export async function PUT(req: NextRequest) {
  const g = await requirePerm(req, "settings.edit");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const items = cleanChecklist(b.items);
  if (!items) return NextResponse.json({ error: "items must be a list" }, { status: 400 });
  await setChecklistDefaults(items);
  await logAudit(req, "system", null, "settings", "Changed the default checklist ({count} items)", { count: items.length });
  return NextResponse.json({ items });
}
