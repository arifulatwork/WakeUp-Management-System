import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { LINE_STATUSES } from "@/lib/ordering";
import { canManageGroup, cleanOrderLines, jerr, refreshOrderStatus } from "@/lib/orderLogic";

const SUPPLIER_ACTIONS = ["line", "dispatch", "deliver"];

// PATCH /api/orders/:id { action, ... }
//   coordinator of the group / admin:
//     set_lines { lines, note? }  rewrite the order while it is still OPEN
//     submit                       OPEN -> APPROVED: send it to the supplier (no student request may still be waiting)
//     cancel                       before the supplier started preparing
//   supplier / admin:
//     line { lineId, status: PENDING|PREPARED|UNAVAILABLE, preparedQty?, missingNote?, substituteName? }
//     dispatch                     all lines handled, at least one prepared
//     deliver                      DISPATCHED -> DELIVERED
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const order = await db.order.findUnique({ where: { id: params.id }, include: { group: true } });
  if (!order) return jerr("not found", 404);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const gname = order.group?.name ?? "";

  // ---------- supplier side ----------
  if (SUPPLIER_ACTIONS.includes(action)) {
    if (!can(me.role, "orders.fulfil")) return jerr("forbidden", 403);

    if (action === "line") {
      if (!["APPROVED", "PREPARING", "PREPARED"].includes(order.status)) return jerr("this order can no longer be changed", 409);
      const line = await db.orderLine.findUnique({ where: { id: String(b.lineId ?? "") }, include: { product: true } });
      if (!line || line.orderId !== order.id) return jerr("line not found", 404);
      const status = String(b.status);
      if (!LINE_STATUSES.includes(status as any)) return jerr("invalid status");
      const data: Record<string, any> = { status, preparedQty: null, missingNote: null, substituteName: null, preparedAt: status === "PENDING" ? null : new Date() };
      if (status === "PREPARED") {
        const q = Math.floor(Number(b.preparedQty ?? line.quantity));
        if (!Number.isFinite(q) || q < 1 || q > line.quantity) return jerr("invalid quantity");
        data.preparedQty = q;
        if (q < line.quantity) data.missingNote = String(b.missingNote ?? "").trim().slice(0, 200) || null; // short delivery
        if (b.substituteName) {
          const alts = ((line.product?.alternatives ?? []) as any[]).map((a) => `${a.name}${a.brand ? ` (${a.brand})` : ""}`);
          if (!alts.includes(String(b.substituteName))) return jerr("only an approved alternative can be used");
          data.substituteName = String(b.substituteName);
        }
      } else if (status === "UNAVAILABLE") {
        data.missingNote = String(b.missingNote ?? "").trim().slice(0, 200) || null;
      }
      await db.orderLine.update({ where: { id: line.id }, data });
      await refreshOrderStatus(order.id);
      if (status === "UNAVAILABLE") await logAudit(req, "order", order.id, "missing", "Marked {product} as unavailable for {group}", { product: line.product?.name ?? "", group: gname });
      return NextResponse.json({ ok: true });
    }

    if (action === "dispatch") {
      if (order.status !== "PREPARED") return jerr("prepare every product first (or mark it as unavailable)", 409);
      const lines = await db.orderLine.findMany({ where: { orderId: order.id } });
      if (!lines.some((l: any) => l.status === "PREPARED")) return jerr("nothing was prepared", 409);
      await db.order.update({ where: { id: order.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      await logAudit(req, "order", order.id, "dispatch", "Dispatched the order of {group}", { group: gname });
      return NextResponse.json({ ok: true });
    }

    if (order.status !== "DISPATCHED") return jerr("dispatch the order first", 409);
    await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await logAudit(req, "order", order.id, "deliver", "Delivered the order of {group}", { group: gname });
    return NextResponse.json({ ok: true });
  }

  // ---------- coordinator side ----------
  if (!can(me.role, "orders.create") || !(await canManageGroup(me, order.groupId))) return jerr("forbidden", 403);

  if (action === "set_lines") {
    if (order.status !== "OPEN") return jerr("the order was already sent to the supplier", 409);
    const { lines, error } = await cleanOrderLines(b.lines, order.group?.country);
    if (error || !lines) return jerr(error ?? "invalid lines");
    await db.orderLine.deleteMany({ where: { orderId: order.id } });
    for (const l of lines) await db.orderLine.create({ data: { orderId: order.id, ...l } });
    await db.order.update({ where: { id: order.id }, data: { note: String(b.note ?? "").trim().slice(0, 300) || null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "submit") {
    if (order.status !== "OPEN") return jerr("already sent", 409);
    if (!(await db.orderLine.count({ where: { orderId: order.id } }))) return jerr("the order is empty", 409);
    const waiting = (await db.studentRequest.findMany({ where: { groupId: order.groupId, orderDate: order.orderDate, status: "PENDING" } })).length;
    if (waiting) return NextResponse.json({ error: "requests waiting", waiting }, { status: 409 });
    await db.order.update({ where: { id: order.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    await logAudit(req, "order", order.id, "submit", "Sent the order of {group} to the supplier", { group: gname });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    const lines = await db.orderLine.findMany({ where: { orderId: order.id } });
    const started = lines.some((l: any) => l.status !== "PENDING");
    if (!["OPEN", "APPROVED"].includes(order.status) || started) return jerr("the supplier already started this order", 409);
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await logAudit(req, "order", order.id, "cancel", "Cancelled the order of {group}", { group: gname });
    return NextResponse.json({ ok: true });
  }
  return jerr("invalid action");
}
