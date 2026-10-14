import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";

// POST /api/auth/register — Super Admin sets (or resets) the username + password
// of any staff member (cleaner, maintenance, coordinator, manager or admin).
// Body: { workerId, username, password }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "staff.manage");
  if (g.error) return g.error;

  const body = await req.json();
  const { workerId, password } = body;
  const username = String(body.username ?? "").trim().toLowerCase();
  if (!workerId || !username || !password) {
    return NextResponse.json({ error: "workerId, username and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await db.worker.findUnique({ where: { username } });
  if (existing && existing.id !== workerId) {
    return NextResponse.json({ error: "username already taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const worker = await db.worker.update({
    where: { id: workerId },
    data: { username, passwordHash },
  });

  return NextResponse.json({ id: worker.id, username: worker.username });
}
