import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";

// GET /api/materials — ?pending=1 for just open requests (Manager/Ops),
// otherwise everything.
export async function GET(req: NextRequest) {
  const g = await requirePerm(req, "data.read");
  if (g.error) return g.error;
  const pendingOnly = req.nextUrl.searchParams.get("pending");
  const requests = await db.materialRequest.findMany({
    where: pendingOnly ? { status: "PENDING" } : undefined,
    include: { house: true, requestedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST /api/materials — the cleaner's "Request products / materials" button.
export async function POST(req: NextRequest) {
  const { houseId, items, requestedById: claimedRequester } = await req.json();
  const requestedById = await actingWorkerId(req, claimedRequester);
  if (!houseId || !items || !requestedById) {
    return NextResponse.json(
      { error: "houseId, items and requestedById are required" },
      { status: 400 }
    );
  }
  const request = await db.materialRequest.create({
    data: { houseId, items, requestedById },
    include: { house: true, requestedBy: true },
  });
  await logAudit(req, "material", request.id, "create", "Requested materials for {house}",
    { house: request.house?.name ?? houseId }, requestedById);
  pushAsync({ roles: STAFF_ROLES, excludeWorkerId: requestedById }, "material_new",
    { house: request.house?.name ?? "", items: String(items).slice(0, 80) }, `material-${request.id}`);
  return NextResponse.json(request, { status: 201 });
}
