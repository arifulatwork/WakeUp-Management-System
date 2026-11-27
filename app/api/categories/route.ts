import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { cleanCategories, getCategories, setCategories } from "@/lib/settings";
import { jerr } from "@/lib/orderLogic";

// FOOD CATEGORIES (Fruit, Dairy, Drinks …) — created by the Super Admin, then chosen on every product.
// The list lives in the AppSetting table (key "foodCategories"), so no database migration is needed.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

// The list, how many products use each category, and the categories that products already have but that are not on the list yet.
async function payload() {
  const categories = await getCategories();
  const rows: { category: string }[] = await db.product.findMany({ select: { category: true } });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1;
  const unlisted = Object.keys(counts).filter((c) => c !== "General" && !categories.includes(c)).sort((a, b) => a.localeCompare(b));
  return { categories, counts, unlisted };
}

// GET /api/categories — everyone who may see the catalogue.
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return jerr("sign in required", 401);
  return NextResponse.json(await payload());
}

// POST /api/categories — admin adds one category { name } or several { names: [...] }.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const list = await getCategories();
  const wanted = Array.isArray(b.names) ? b.names.map(clean).filter(Boolean) : [clean(b.name)].filter(Boolean);
  if (!wanted.length) return jerr("name required");
  if (!Array.isArray(b.names) && list.some((c) => same(c, wanted[0]))) return jerr("exists", 409);
  const next = cleanCategories([...list, ...wanted]); // skips names that are already there
  await setCategories(next);
  await logAudit(req, "setting", null, "categories", "Changed the food categories", {});
  return NextResponse.json(await payload(), { status: 201 });
}

// PATCH /api/categories — admin renames { from, to }. Every product in that category moves to the new name.
export async function PATCH(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const from = clean(b.from), to = clean(b.to);
  if (!from || !to) return jerr("name required");
  const list = await getCategories();
  if (!list.includes(from)) return jerr("not found", 404);
  if (list.some((c) => c !== from && same(c, to)) || to === "General") return jerr("exists", 409);
  await setCategories(list.map((c) => (c === from ? to : c)));
  if (from !== to) await db.product.updateMany({ where: { category: from }, data: { category: to } });
  await logAudit(req, "setting", null, "categories", "Changed the food categories", {});
  return NextResponse.json(await payload());
}

// DELETE /api/categories — admin removes { name }. Refused while products still use it.
export async function DELETE(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const name = clean(b.name);
  const list = await getCategories();
  if (!list.includes(name)) return jerr("not found", 404);
  if ((await db.product.count({ where: { category: name } })) > 0) return jerr("in use", 409);
  await setCategories(list.filter((c) => c !== name));
  await logAudit(req, "setting", null, "categories", "Changed the food categories", {});
  return NextResponse.json(await payload());
}
