import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, DEMO_MODE } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requirePerm } from "@/lib/guard";

// POST /api/workers — the Super Admin adds a staff member WITH their login.
// Body: { name, language, area, username, password }
// (Self sign-up no longer exists: nobody can create themselves an account.)
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "staff.manage");
  if (g.error) return g.error;

  const body = await req.json();
  const { name, language, area, password } = body;
  const username = String(body.username ?? "").trim().toLowerCase();

  if (!name || !language || !area || !username || !password) {
    return NextResponse.json(
      { error: "name, language, area, username and password are required" },
      { status: 400 }
    );
  }
  if (area !== "CLEANING" && area !== "MAINTENANCE") {
    return NextResponse.json({ error: "invalid area" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  if (await db.worker.findUnique({ where: { username } })) {
    return NextResponse.json({ error: "username already taken" }, { status: 409 });
  }

  const worker = await db.worker.create({
    data: {
      name, language, area: area as "CLEANING" | "MAINTENANCE",
      username, passwordHash: await bcrypt.hash(String(password), 10),
    },
  });

  // Demo build only: give a new cleaner something to look at straight away.
  if (DEMO_MODE && area === "CLEANING") {
    const { seedDemoTasks } = await import("@/lib/mockDb");
    await seedDemoTasks(worker.id);
  }

  await logAudit(req, "staff", worker.id, "create", "New staff member onboarded: {name} ({team})", { name: worker.name, team: area }, worker.id);
  const { passwordHash, ...safe } = worker;
  return NextResponse.json(safe, { status: 201 });
}

// GET /api/workers — list staff (dashboards use it to assign tasks and show workload).
// Requires a login (middleware); password hashes are never sent.
export async function GET() {
  const workers = await db.worker.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(workers.map(({ passwordHash, ...w }: { passwordHash?: string }) => w));
}
