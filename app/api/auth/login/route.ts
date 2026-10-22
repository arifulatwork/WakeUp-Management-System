import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";

// POST /api/auth/login { username, password } — for EVERY role (cleaner, maintenance,
// coordinator, manager, admin). Accounts live in the Worker table of the database
// (Supabase when NEXT_PUBLIC_DEMO_MODE="false"); passwords are stored only as bcrypt hashes.
// Brute-force protection: 8 wrong passwords for the same login + address in 15 minutes -> wait.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = ((globalThis as any).__wuLoginFails ??= new Map<string, { n: number; first: number }>()) as Map<string, { n: number; first: number }>;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10); // so unknown users take as long as known ones

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${ip}|${username}`;
  const rec = fails.get(key);
  if (rec && Date.now() - rec.first > WINDOW_MS) fails.delete(key);
  if ((fails.get(key)?.n ?? 0) >= MAX_FAILS) {
    return NextResponse.json({ error: "too many attempts, try again in a few minutes" }, { status: 429 });
  }
  const fail = () => {
    const r = fails.get(key) ?? { n: 0, first: Date.now() };
    r.n++;
    fails.set(key, r);
    if (fails.size > 5000) fails.clear();
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  };

  const worker = await db.worker.findUnique({ where: { username } });
  // Same answer (and the same time) whether the username or the password is wrong.
  if (!worker || !worker.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
    return fail();
  }
  const ok = await bcrypt.compare(password, worker.passwordHash);
  if (!ok) return fail();
  fails.delete(key);

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
