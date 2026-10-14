import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";

// POST /api/auth/login { username, password } — for EVERY role (cleaner, maintenance,
// coordinator, manager, admin). Accounts live in the Worker table of the database
// (Supabase when NEXT_PUBLIC_DEMO_MODE="false"); passwords are stored only as bcrypt hashes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const worker = await db.worker.findUnique({ where: { username } });
  // Same answer whether the username or the password is wrong.
  if (!worker || !worker.passwordHash) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, worker.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const token = await createSession({ workerId: worker.id, name: worker.name, role: worker.role });

  const res = NextResponse.json({
    id: worker.id, name: worker.name, role: worker.role, area: worker.area, language: worker.language,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
