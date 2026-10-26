import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";

// GET /api/workers — the staff list (never includes password hashes).
// Signed-in users only (middleware). One-person reads live in /api/workers/[id].
export async function GET() {
  const workers = await db.worker.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(workers.map(({ passwordHash, ...safe }: any) => safe));
}

// POST /api/workers — Super Admin adds a staff member (username + password required).
// Body: { name, area, language?, username, password, role? }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "staff.manage");
  if (g.error) return g.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const language = String(body.language ?? "en");
  const area = body.area;
  const role = body.role ?? "worker";

  const LANGS = ["en", "pt", "es", "fr", "it", "uk"];
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (area !== "CLEANING" && area !== "MAINTENANCE") return NextResponse.json({ error: "invalid area" }, { status: 400 });
  if (!LANGS.includes(language)) return NextResponse.json({ error: "invalid language" }, { status: 400 });
  if (!["worker", "coordinator", "manager", "admin"].includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });

  const taken = await db.worker.findUnique({ where: { username } });
  if (taken) return NextResponse.json({ error: "username already taken" }, { status: 409 });

  const worker = await db.worker.create({
    data: { name, area, language, role, username, passwordHash: await bcrypt.hash(password, 10) },
  });
  await logAudit(req, "staff", worker.id, "create", "Added staff member {name}", { name: worker.name });
  const { passwordHash, ...safe } = worker;
  return NextResponse.json(safe, { status: 201 });
}
