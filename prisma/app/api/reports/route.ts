import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — managers and admins: totals, per-group figures, most ordered
// products, missing products and the order history for the period (default: everything).
export async function GET(req: NextRequest) {
  const g = await requirePerm(req, "reports.read");
  if (g.error) return g.error;
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";

  const orders = (await db.order.findMany({ include: { group: true }, orderBy: { createdAt: "desc" } }))
    .filter((o: any) => (!from || o.orderDate >= from) && (!to || o.orderDate <= to));
  const ids = orders.map((o: any) => o.id);
  const lines = ids.length ? await db.orderLine.findMany({ where: { orderId: { in: ids } }, include: { product: true } }) : [];
  const requests = (await db.studentRequest.findMany({})).filter((r: any) => (!from || r.orderDate >= from) && (!to || r.orderDate <= to));

  const live = orders.filter((o: any) => o.status !== "CANCELLED");
  const byStatus: Record<string, number> = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  const reqByStatus: Record<string, number> = {};
  for (const r of requests) reqByStatus[r.status] = (reqByStatus[r.status] ?? 0) + 1;

  const liveIds = new Set(live.map((o: any) => o.id));
  const units = (oid: string) => lines.filter((l: any) => l.orderId === oid).reduce((n: number, l: any) => n + l.quantity, 0);

  const groups: Record<string, { group: string; orders: number; delivered: number; units: number }> = {};
  for (const o of live) {
    const k = o.groupId;
    groups[k] ??= { group: o.group?.name ?? "—", orders: 0, delivered: 0, units: 0 };
    groups[k].orders++;
    if (o.status === "DELIVERED") groups[k].delivered++;
    groups[k].units += units(o.id);
  }

  const products: Record<string, { product: string; unit: string; ordered: number; prepared: number; missing: number }> = {};
  for (const l of lines.filter((x: any) => liveIds.has(x.orderId))) {
    const k = l.productId;
    products[k] ??= { product: l.product?.name ?? "—", unit: l.product?.unit ?? "", ordered: 0, prepared: 0, missing: 0 };
    products[k].ordered += l.quantity;
    products[k].prepared += l.preparedQty ?? 0;
    if (l.status === "UNAVAILABLE") products[k].missing += l.quantity;
    else if (l.preparedQty != null && l.preparedQty < l.quantity) products[k].missing += l.quantity - l.preparedQty;
  }

  return NextResponse.json({
    totals: { orders: live.length, units: live.reduce((n: number, o: any) => n + units(o.id), 0), requests: requests.length },
    byStatus, requestsByStatus: reqByStatus,
    groups: Object.values(groups).sort((a, b) => b.units - a.units),
    products: Object.values(products).sort((a, b) => b.ordered - a.ordered),
    history: orders.slice(0, 100).map((o: any) => ({
      id: o.id, group: o.group?.name ?? "—", orderDate: o.orderDate, status: o.status, units: units(o.id),
      approvedAt: o.approvedAt, dispatchedAt: o.dispatchedAt, deliveredAt: o.deliveredAt,
    })),
  });
}
