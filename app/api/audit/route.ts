import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";

// GET /api/audit?limit=100 — newest first. Super Admin only.
export async function GET(req: NextRequest) {
  const g = await requirePerm(req, "audit.read");
  if (g.error) return g.error;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json(rows);
}
