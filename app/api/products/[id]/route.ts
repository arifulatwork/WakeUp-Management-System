import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanProduct, coordinatorCountries, jerr } from "@/lib/orderLogic";
import { slimProduct } from "@/lib/mediaSlim";
import { deleteRef } from "@/lib/storage";
import { categoryExists } from "@/lib/categories";

// PATCH /api/products/:id — admin edits any of the product fields (brand, standard quantity, alternatives, active …).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.products");
  if (g.error) return g.error;
  const before = await db.product.findUnique({ where: { id: params.id } });
  if (!before) return jerr("not found", 404);
  const { data, error } = await cleanProduct(await req.json().catch(() => ({})), true);
  if (error || !data) return jerr(error ?? "invalid product");
  if (data.category !== undefined && !(await categoryExists(data.category))) return jerr("choose a category from the list");
  if (g.session.role !== "admin") {
    // Coordinator: only products of their own groups' countries, and they can't move one to another country.
    const mine = await coordinatorCountries(g.session as any);
    if (!before.country || !mine.includes(before.country)) return jerr("forbidden", 403);
    if (data.country !== undefined && !(data.country && mine.includes(data.country))) return jerr("forbidden", 403);
  }
  if (!Object.keys(data).length) return jerr("nothing to change");
  const row = await db.product.update({ where: { id: params.id }, data });
  if (data.photo !== undefined && before.photo && before.photo !== data.photo) await deleteRef(before.photo); // old photo no longer needed
  await logAudit(req, "product", row.id, "update", "Edited product {name}", { name: row.name });
  return NextResponse.json(slimProduct(row));
}

// DELETE /api/products/:id — admin. A product already used in a request or order is kept for the history: set it inactive instead.
// Super Admin only: ?force=1 deletes the product AND its lines in requests/orders (requests/orders left empty are removed too).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.products");
  if (g.error) return g.error;
  const p = await db.product.findUnique({ where: { id: params.id } });
  if (!p) return jerr("not found", 404);
  if (g.session.role !== "admin" && !(p.country && (await coordinatorCountries(g.session as any)).includes(p.country))) return jerr("forbidden", 403);
  const used = (await db.requestLine.count({ where: { productId: p.id } })) + (await db.orderLine.count({ where: { productId: p.id } }));
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (used > 0 && !force) return jerr("in use", 409);
  if (used > 0 && g.session.role !== "admin") return jerr("forbidden", 403);
  if (used > 0) {
    // Remember which requests/orders are affected, drop the lines, then drop the ones that ended up empty.
    const reqIds = (await db.requestLine.findMany({ where: { productId: p.id }, select: { requestId: true } })).map((l) => l.requestId);
    const ordIds = (await db.orderLine.findMany({ where: { productId: p.id }, select: { orderId: true } })).map((l) => l.orderId);
    await db.requestLine.deleteMany({ where: { productId: p.id } });
    await db.orderLine.deleteMany({ where: { productId: p.id } });
    for (const id of new Set(reqIds)) if (!(await db.requestLine.count({ where: { requestId: id } }))) await db.studentRequest.delete({ where: { id } }).catch(() => {});
    for (const id of new Set(ordIds)) if (!(await db.orderLine.count({ where: { orderId: id } }))) await db.order.delete({ where: { id } }).catch(() => {});
  }
  await db.product.delete({ where: { id: p.id } });
  await deleteRef(p.photo);
  await logAudit(req, "product", p.id, "delete", used > 0 ? "Deleted product {name} and its {n} request/order lines" : "Deleted product {name}", { name: p.name, n: used });
  return NextResponse.json({ ok: true });
}
