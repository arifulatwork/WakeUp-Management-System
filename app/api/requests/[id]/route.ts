import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { addToGroupOrder, canManageGroup, intQty, jerr, OrderLocked } from "@/lib/orderLogic";

// PATCH /api/requests/:id
//   student (own, still waiting):        { action: "cancel" }
//   coordinator of the group / admin:    { action: "approve", note?, lines?: [{ id, decision: "APPROVE"|"REJECT", approvedQty? }] }
//                                        { action: "reject", note? }
// Approving moves the approved lines into the group's order for that ordering day.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const r = await db.studentRequest.findUnique({ where: { id: params.id }, include: { student: true, group: true } });
  if (!r) return jerr("not found", 404);
  const b = await req.json().catch(() => ({}));
  const note = String(b.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;

  if (b.action === "cancel") {
    if (me.role !== "student" || r.studentId !== me.workerId) return jerr("forbidden", 403);
    if (r.status !== "PENDING") return jerr("already decided", 409);
    await db.studentRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await logAudit(req, "request", r.id, "cancel", "{name} cancelled a product request", { name: r.student?.name ?? "" });
    return NextResponse.json({ ok: true });
  }

  if (!can(me.role, "requests.review") || !(await canManageGroup(me, r.groupId))) return jerr("forbidden", 403);
  if (r.status !== "PENDING") return jerr("already decided", 409);
  const who = r.student?.name ?? "";

  if (b.action === "reject") {
    await db.studentRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decisionNote: note, decidedById: me.workerId, decidedAt: new Date() } });
    for (const l of await db.requestLine.findMany({ where: { requestId: r.id } })) await db.requestLine.update({ where: { id: l.id }, data: { lineStatus: "REJECTED", approvedQty: null } });
    await logAudit(req, "request", r.id, "reject", "Rejected the product request of {name}", { name: who });
    return NextResponse.json({ ok: true });
  }

  if (b.action !== "approve") return jerr("invalid action");
  const lines = await db.requestLine.findMany({ where: { requestId: r.id } });
  const choices: Record<string, any> = {};
  for (const c of Array.isArray(b.lines) ? b.lines : []) choices[String(c?.id)] = c;

  const decided = [];
  for (const l of lines) {
    const c = choices[l.id];
    const reject = c?.decision === "REJECT";
    let qty: number | null = 0;
    if (!reject) {
      qty = intQty(c?.approvedQty ?? l.quantity);
      if (qty === null) return jerr("invalid quantity");
    }
    decided.push({ line: l, reject, qty: qty as number });
  }
  const kept = decided.filter((d) => !d.reject);
  if (!kept.length) return jerr("approve at least one line, or reject the request");

  try {
    await addToGroupOrder(r.groupId, r.orderDate, me.workerId, kept.map((d) => ({ productId: d.line.productId, quantity: d.qty, alternativeName: d.line.alternativeName })));
  } catch (e) {
    if (e instanceof OrderLocked) return jerr("the order was already sent to the supplier", 409);
    throw e;
  }
  for (const d of decided) {
    await db.requestLine.update({ where: { id: d.line.id }, data: d.reject ? { lineStatus: "REJECTED", approvedQty: null } : { lineStatus: "APPROVED", approvedQty: d.qty } });
  }
  await db.studentRequest.update({ where: { id: r.id }, data: { status: "APPROVED", decisionNote: note, decidedById: me.workerId, decidedAt: new Date() } });
  await logAudit(req, "request", r.id, "approve", "Approved the product request of {name}", { name: who });
  return NextResponse.json({ ok: true });
}
