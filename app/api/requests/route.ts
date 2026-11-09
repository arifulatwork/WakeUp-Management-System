import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { getOrdering } from "@/lib/settings";
import { dateKey, dietaryGaps, orderingWindow } from "@/lib/ordering";
import { addToGroupOrder, groupsFor, intQty, jerr, OrderLocked, requestsWithLines, studentWithinLimit } from "@/lib/orderLogic";

// GET /api/requests — student: their own · coordinator: their groups' · admin/manager: all. Newest first.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  let where: Record<string, any> | undefined;
  if (me.role === "student") where = { studentId: me.workerId };
  else if (me.role === "coordinator") where = { groupId: { in: (await groupsFor(me)).map((g: any) => g.id) } };
  else if (!["admin", "manager"].includes(me.role)) return jerr("forbidden", 403);
  const rows = await db.studentRequest.findMany({ where, include: { student: true, group: true }, orderBy: { createdAt: "desc" }, take: 300 });
  const full = await requestsWithLines(rows);
  return NextResponse.json(full.map((r: any) => ({
    ...r,
    student: r.student ? { id: r.student.id, name: r.student.name, dietary: r.student.dietary ?? [] } : null,
    group: r.group ? { id: r.group.id, name: r.group.name } : null,
  })));
}

// POST /api/requests { lines: [{ productId, quantity, reason?, alternativeId? }] } — a student asks for products.
// Only when the ordering model is "students send requests", ordering is open (day + cut-off) and, if the
// quantity differs from the standard one, with a reason (and only if the admin allows exceptions).
export async function POST(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  if (me.role !== "student" || !me.groupId) return jerr("forbidden", 403);
  const cfg = await getOrdering();
  if (cfg.model !== "STUDENT_REQUESTS") return jerr("the coordinator orders for the group", 403);
  const win = orderingWindow(cfg);
  if (!win.open) return NextResponse.json({ error: "ordering closed", reason: win.reason, nextDay: win.nextDay }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const input = Array.isArray(b.lines) ? b.lines : [];
  if (!input.length) return jerr("choose at least one product");
  if (input.length > 40) return jerr("too many products");

  const mine = await db.studentRequest.findMany({ where: { studentId: me.workerId, status: "PENDING" } });
  if (mine.length) return jerr("you already have a request waiting for approval", 409);

  const student = await db.worker.findUnique({ where: { id: me.workerId } });
  const group = await db.group.findUnique({ where: { id: me.groupId } });
  if (!student || !group) return jerr("not found", 404);
  if (!(await studentWithinLimit(group, student.id))) return jerr("group is full", 403); // only as many students as the coordinator set may order
  const products = await db.product.findMany({});

  const seen = new Set<string>();
  const lines: Record<string, any>[] = [];
  for (const l of input) {
    const p = products.find((x: any) => x.id === l?.productId && x.active);
    if (!p) return jerr("product not available", 404);
    if (seen.has(p.id)) return jerr("each product only once");
    seen.add(p.id);
    const quantity = intQty(l.quantity);
    if (quantity === null) return jerr("invalid quantity");
    const exception = quantity !== p.standardQty;
    const reason = String(l.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (exception && !cfg.allowExceptions) return jerr("quantity must be the standard quantity");
    if (exception && reason.length < 3) return jerr("reason required");
    let alt: any = null;
    if (l.alternativeId) {
      alt = ((p.alternatives ?? []) as any[]).find((a) => a.id === l.alternativeId);
      if (!alt) return jerr("alternative not found", 404);
    }
    const gaps = dietaryGaps(student.dietary, alt ? alt.dietaryTags : p.dietaryTags);
    lines.push({
      productId: p.id, quantity, standardQty: p.standardQty, exceptionReason: exception ? reason : null,
      alternativeName: alt ? `${alt.name}${alt.brand ? ` (${alt.brand})` : ""}` : null,
      dietaryFlag: gaps.length ? gaps.join(", ") : null,
    });
  }

  const request = await db.studentRequest.create({ data: { groupId: group.id, studentId: student.id, orderDate: dateKey(), status: "PENDING" } });
  for (const l of lines) await db.requestLine.create({ data: { requestId: request.id, ...l } });
  await logAudit(req, "request", request.id, "create", "{name} sent a product request ({count} products)", { name: student.name, count: lines.length }, student.id);

  // Approval switched off in the workflow and nothing unusual in the request: it goes straight into the group order.
  if (!cfg.requireApproval && lines.every((l) => !l.exceptionReason)) {
    try {
      await addToGroupOrder(group.id, request.orderDate, group.coordinatorId ?? student.id, lines.map((l) => ({ productId: l.productId, quantity: l.quantity, alternativeName: l.alternativeName })));
      for (const l of await db.requestLine.findMany({ where: { requestId: request.id } })) {
        await db.requestLine.update({ where: { id: l.id }, data: { lineStatus: "APPROVED", approvedQty: l.quantity } });
      }
      await db.studentRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedAt: new Date() } });
    } catch (e) {
      if (!(e instanceof OrderLocked)) throw e; // the order was already sent on: the coordinator decides
    }
  }
  return NextResponse.json({ id: request.id }, { status: 201 });
}
