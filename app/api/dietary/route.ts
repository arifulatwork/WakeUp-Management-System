import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession, requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { jerr } from "@/lib/orderLogic";

// GET /api/dietary — the dietary requirements that exist (Vegan, Gluten-free …). Any signed-in role.
export async function GET(req: NextRequest) {
  if (!(await currentSession(req))) return jerr("sign in required", 401);
  return NextResponse.json(await db.dietaryRequirement.findMany({ orderBy: { name: "asc" } }));
}

// POST /api/dietary { name, description? } — admin.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "catalogue.manage");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return jerr("name required");
  if (await db.dietaryRequirement.findUnique({ where: { name } })) return jerr("already exists", 409);
  try {
    const row = await db.dietaryRequirement.create({ data: { name, description: String(b.description ?? "").trim().slice(0, 200) || null } });
    await logAudit(req, "product", row.id, "create", "Added dietary requirement {name}", { name });
    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return jerr("already exists", 409);
    throw e;
  }
}
