import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanProduct, coordinatorCountries, jerr } from "@/lib/orderLogic";
import { slimProduct } from "@/lib/mediaSlim";
import { deleteRef } from "@/lib/storage";

// PATCH /api/products/:id — admin edits any of the product fields (brand, standard quantity, alternatives, active …).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.products");
  if (g.error) return g.error;
  const before = await db.product.findUnique({ where: { id: params.id } });
  if (!before) return jerr("not found", 404);
  const { data, error } = await cleanProduct(await req.json().catch(() => ({})), true);
  if (error || !data) return jerr(error ?? "invalid product");
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
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.products");
  if (g.error) return g.error;
  const p = await db.product.findUnique({ where: { id: params.id } });
  if (!p) return jerr("not found", 404);
  if (g.session.role !== "admin" && !(p.country && (await coordinatorCountries(g.session as any)).includes(p.country))) return jerr("forbidden", 403);
  const used = (await db.requestLine.count({ where: { productId: p.id } })) + (await db.orderLine.count({ where: { productId: p.id } }));
  if (used > 0) return jerr("in use", 409);
  await db.product.delete({ where: { id: p.id } });
  await deleteRef(p.photo);
  await logAudit(req, "product", p.id, "delete", "Deleted product {name}", { name: p.name });
  return NextResponse.json({ ok: true });
}
