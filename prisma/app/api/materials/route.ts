import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";

// GET /api/materials — every material request (office roles).
export async function GET(req: NextRequest) {
  const g = await requirePerm(req, "data.read");
  if (g.error) return g.error;
  const rows = await db.materialRequest.findMany({
    include: { house: true, requestedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

// POST /api/materials — anyone signed in can REQUEST materials.
// Body: { houseId, items, requestedById }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const requestedById = await actingWorkerId(req, b.requestedById);
  if (!requestedById) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const items = String(b.items ?? "").trim();
  if (!b.houseId || !items) return NextResponse.json({ error: "house and items required" }, { status: 400 });
  const house = await db.house.findUnique({ where: { id: b.houseId } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });
  if (!(await db.worker.findUnique({ where: { id: requestedById } }))) return NextResponse.json({ error: "worker not found" }, { status: 404 });

  const row = await db.materialRequest.create({
    data: { houseId: b.houseId, requestedById, items, status: "PENDING" },
    include: { house: true, requestedBy: true },
  });
  await logAudit(req, "material", row.id, "create", "Requested materials for {house}", { house: house.name }, requestedById);
  pushAsync({ roles: STAFF_ROLES, excludeWorkerId: requestedById }, "material_new", { house: house.name, items }, `material-${row.id}`);
  return NextResponse.json(row, { status: 201 });
}
