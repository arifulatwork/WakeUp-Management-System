import { NextRequest, NextResponse } from "next/server";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanFields, getTaskFields, setTaskFields } from "@/lib/settings";

// GET /api/settings/task-fields -> { fields: [{ id, label, type }] }  (any signed-in person)
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  return NextResponse.json({ fields: await getTaskFields() });
}

// PUT /api/settings/task-fields  { fields: [{ id?, label, type }] }  (Super Admin only)
export async function PUT(req: NextRequest) {
  const g = await requirePerm(req, "settings.edit");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const fields = cleanFields(b.fields);
  if (!fields) return NextResponse.json({ error: "fields must be a list" }, { status: 400 });
  await setTaskFields(fields);
  await logAudit(req, "system", null, "settings", "Changed the extra task fields ({count} fields)", { count: fields.length });
  return NextResponse.json({ fields });
}
