import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { jerr } from "@/lib/orderLogic";

// PATCH — admin edits the description (the name is what students and products refer to, so it stays fixed).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  if (!(await db.dietaryRequirement.findUnique({ where: { id: params.id } }))) return jerr("not found", 404);
  const b = await req.json().catch(() => ({}));
  const row = await db.dietaryRequirement.update({ where: { id: params.id }, data: { description: String(b.description ?? "").trim().slice(0, 200) || null } });
  return NextResponse.json(row);
}

// DELETE — admin. Removes the requirement from students, products and alternatives too.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const d = await db.dietaryRequirement.findUnique({ where: { id: params.id } });
  if (!d) return jerr("not found", 404);
  for (const w of await db.worker.findMany({ where: { role: "student" } })) {
    if ((w.dietary ?? []).includes(d.name)) await db.worker.update({ where: { id: w.id }, data: { dietary: w.dietary.filter((x: string) => x !== d.name) } });
  }
  for (const p of await db.product.findMany({})) {
    const alts = (p.alternatives ?? []) as any[];
    const touched = (p.dietaryTags ?? []).includes(d.name) || alts.some((a) => (a.dietaryTags ?? []).includes(d.name));
    if (touched) await db.product.update({ where: { id: p.id }, data: {
      dietaryTags: p.dietaryTags.filter((x: string) => x !== d.name),
      alternatives: alts.map((a) => ({ ...a, dietaryTags: (a.dietaryTags ?? []).filter((x: string) => x !== d.name) })),
    } });
  }
  await db.dietaryRequirement.delete({ where: { id: d.id } });
  await logAudit(req, "product", d.id, "delete", "Deleted dietary requirement {name}", { name: d.name });
  return NextResponse.json({ ok: true });
}
