import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanProduct, coordinatorCountries, groupsFor, jerr } from "@/lib/orderLogic";
import { productInCountry } from "@/lib/ordering";
import { slimProduct } from "@/lib/mediaSlim";

// GET /api/products — the catalogue. Everyone signed in can read it; students and suppliers only see active products.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const rows = await db.product.findMany({ orderBy: { name: "asc" } });
  let list = ["admin", "manager", "coordinator"].includes(me.role) ? rows : rows.filter((p: any) => p.active);
  // Each country has its own products: students only get their group's country (+ the products for all countries),
  // coordinators the countries of their groups. Admin / manager / supplier see everything they saw before.
  if (me.role === "student") {
    const group = me.groupId ? await db.group.findUnique({ where: { id: me.groupId } }) : null;
    list = list.filter((p: any) => productInCountry(p, group?.country));
  } else if (me.role === "coordinator") {
    const countries = (await groupsFor(me)).map((g: any) => g.country);
    list = list.filter((p: any) => !p.country || countries.includes(p.country));
  }
  return NextResponse.json(list.map(slimProduct));
}

// POST /api/products — admin adds a product: { name, category, unit, brand, standardQty, dietaryTags, alternatives, active }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.products");
  if (g.error) return g.error;
  const { data, error } = await cleanProduct(await req.json().catch(() => ({})), false);
  if (error || !data) return jerr(error ?? "invalid product");
  // A coordinator can only add a product for the country of one of their own groups (never for "all countries").
  if (g.session.role !== "admin" && !(data.country && (await coordinatorCountries(g.session as any)).includes(data.country))) return jerr("forbidden", 403);
  const row = await db.product.create({ data });
  await logAudit(req, "product", row.id, "create", "Added product {name}", { name: row.name });
  return NextResponse.json(slimProduct(row), { status: 201 });
}
