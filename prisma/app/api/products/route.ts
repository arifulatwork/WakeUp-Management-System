import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanProduct, jerr } from "@/lib/orderLogic";

// GET /api/products — the catalogue. Everyone signed in can read it; students and suppliers only see active products.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return jerr("sign in required", 401);
  const rows = await db.product.findMany({ orderBy: { name: "asc" } });
  const list = ["admin", "manager", "coordinator"].includes(me.role) ? rows : rows.filter((p: any) => p.active);
  return NextResponse.json(list);
}

// POST /api/products — admin adds a product: { name, category, unit, brand, standardQty, dietaryTags, alternatives, active }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const { data, error } = await cleanProduct(await req.json().catch(() => ({})), false);
  if (error || !data) return jerr(error ?? "invalid product");
  const row = await db.product.create({ data });
  await logAudit(req, "product", row.id, "create", "Added product {name}", { name: row.name });
  return NextResponse.json(row, { status: 201 });
}
