import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/events";
import { GENERAL } from "@/lib/categories";
import { jerr } from "@/lib/orderLogic";

// FOOD CATEGORIES (Fruit, Dairy, Drinks …) — a real database table ("Category"). The Super Admin creates, renames and
// removes them; every product picks one. The database itself keeps this consistent:
//   • renaming a category renames it on all its products (ON UPDATE CASCADE)
//   • a category that still has products cannot be deleted (ON DELETE RESTRICT)

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
const exists = async (name: string, exceptName?: string) =>
  !!(await db.category.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptName ? { NOT: { name: exceptName } } : {}) } }));

// The categories (without the built-in "General") and how many products each one has.
async function payload() {
  const rows: { name: string }[] = await db.category.findMany({ orderBy: { name: "asc" } });
  const prods: { category: string }[] = await db.product.findMany({ select: { category: true } });
  const counts: Record<string, number> = {};
  for (const p of prods) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return { categories: rows.map((r) => r.name).filter((n) => n !== GENERAL), counts };
}
const logged = (req: NextRequest) => logAudit(req, "setting", null, "categories", "Changed the food categories", {});

// GET /api/categories — everyone who may see the catalogue.
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return jerr("sign in required", 401);
  return NextResponse.json(await payload());
}

// POST /api/categories — admin adds one category { name }, or several { names: [...] } (names that already exist are skipped).
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const many = Array.isArray(b.names);
  const wanted: string[] = (many ? b.names : [b.name]).map(clean).filter(Boolean).slice(0, 60);
  if (!wanted.length) return jerr("name required");
  let added = 0;
  for (const name of wanted) {
    if (await exists(name)) { if (!many) return jerr("exists", 409); continue; }
    try { await db.category.create({ data: { name } }); added++; }
    catch (e: any) { if (e?.code === "P2002") { if (!many) return jerr("exists", 409); } else throw e; } // two admins at once: the database says "already there"
  }
  if (added) await logged(req);
  return NextResponse.json(await payload(), { status: 201 });
}

// PATCH /api/categories — admin renames { from, to }. The database moves every product of that category to the new name.
export async function PATCH(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const from = clean(b.from), to = clean(b.to);
  if (!from || !to) return jerr("name required");
  if (from === GENERAL) return jerr("forbidden", 403);
  if (!(await db.category.count({ where: { name: from } }))) return jerr("not found", 404);
  if (to.toLowerCase() === GENERAL.toLowerCase() || (await exists(to, from))) return jerr("exists", 409);
  if (from !== to) {
    try { await db.category.update({ where: { name: from }, data: { name: to } }); }
    catch (e: any) { if (e?.code === "P2002") return jerr("exists", 409); throw e; }
    notifyChange("product"); // the products were renamed by the database: open screens reload
    await logged(req);
  }
  return NextResponse.json(await payload());
}

// DELETE /api/categories — admin removes { name }. Refused while products still use it.
export async function DELETE(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const name = clean(b.name);
  if (name === GENERAL) return jerr("forbidden", 403);
  if (!(await db.category.count({ where: { name } }))) return jerr("not found", 404);
  if ((await db.product.count({ where: { category: name } })) > 0) return jerr("in use", 409);
  try { await db.category.delete({ where: { name } }); }
  catch (e: any) { if (e?.code === "P2003") return jerr("in use", 409); throw e; } // a product was added a moment ago
  await logged(req);
  return NextResponse.json(await payload());
}
