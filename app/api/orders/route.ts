import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getOrdering } from "@/lib/settings";
import { dateKey, orderingWindow, SUPPLIER_STATUSES } from "@/lib/ordering";
import { canManageGroup, cleanOrderLines, groupsFor, jerr, ordersWithLines } from "@/lib/orderLogic";

const publicOrder = (o: any) => ({
  ...o,
  group: o.group ? { id: o.group.id, name: o.group.name } : null,
  createdBy: o.createdBy ? { id: o.createdBy.id, name: o.createdBy.name } : null,
});

// GET /api/orders — student: their group's · coordinator: their groups' · supplier: orders sent to them · admin/manager: all.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  let where: Record<string, any> | undefined;
  if (me.role === "student") where = { groupId: me.groupId ?? "none" };
  else if (me.role === "coordinator") where = { groupId: { in: (await groupsFor(me)).map((g: any) => g.id) } };
  else if (me.role === "supplier") where = { status: { in: SUPPLIER_STATUSES } };
  else if (!["admin", "manager"].includes(me.role)) return jerr("forbidden", 403);
  const rows = await db.order.findMany({ where, include: { group: true, createdBy: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json((await ordersWithLines(rows)).map(publicOrder));
}

// POST /api/orders { groupId, lines, note? } — the coordinator creates (or rewrites) the group's order for today.
// Only when the ordering model is "the coordinator orders" (admins can always), and while ordering is open.
export async function POST(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  if (!can(me.role, "orders.create")) return jerr("forbidden", 403);
  const b = await req.json().catch(() => ({}));
  const group = await db.group.findUnique({ where: { id: String(b.groupId ?? "") } });
  if (!group) return jerr("group not found", 404);
  if (!(await canManageGroup(me, group.id))) return jerr("forbidden", 403);

  const cfg = await getOrdering();
  if (me.role !== "admin") {
    if (cfg.model !== "COORDINATOR_ORDERS") return jerr("students send requests; review them instead", 403);
    const win = orderingWindow(cfg);
    if (!win.open) return NextResponse.json({ error: "ordering closed", reason: win.reason, nextDay: win.nextDay }, { status: 403 });
  }
  const { lines, error } = await cleanOrderLines(b.lines, group.country);
  if (error || !lines) return jerr(error ?? "invalid lines");

  const orderDate = dateKey();
  let order = (await db.order.findMany({ where: { groupId: group.id, orderDate } })).find((o: any) => o.status !== "CANCELLED");
  if (order && order.status !== "OPEN") return jerr("the order was already sent to the supplier", 409);
  const note = String(b.note ?? "").trim().slice(0, 300) || null;
  if (order) {
    await db.orderLine.deleteMany({ where: { orderId: order.id } });
    await db.order.update({ where: { id: order.id }, data: { note } });
  } else {
    order = await db.order.create({ data: { groupId: group.id, orderDate, createdById: me.workerId, status: "OPEN", note } });
  }
  for (const l of lines) await db.orderLine.create({ data: { orderId: order.id, ...l } });
  await logAudit(req, "order", order.id, "create", "Created the order of {group}", { group: group.name });
  return NextResponse.json({ id: order.id }, { status: 201 });
}
