import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { normName } from "@/lib/houseMode";
import { normCode } from "@/lib/ordering";
import { logAudit } from "@/lib/audit";

// POST /api/auth/student { code, name } — students have no username or password.
// The coordinator announces the group's secret code; a student signs in with that code + their own name.
//   - the code belongs to exactly ONE group (and must be switched on by the coordinator)
//   - the first time a name is used in a group it joins the group; the same name later is the same student
// Brute-force protection like the staff login: 10 wrong codes per address in 15 minutes -> wait.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = ((globalThis as any).__wuStudentFails ??= new Map<string, { n: number; first: number }>()) as Map<string, { n: number; first: number }>;
const MAX_STUDENTS_PER_GROUP = 200;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = normCode(body.code);
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!code || name.length < 2) return NextResponse.json({ error: "code and name required" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const rec = fails.get(ip);
  if (rec && Date.now() - rec.first > WINDOW_MS) fails.delete(ip);
  if ((fails.get(ip)?.n ?? 0) >= MAX_FAILS) return NextResponse.json({ error: "too many attempts, try again in a few minutes" }, { status: 429 });
  const fail = () => {
    const r = fails.get(ip) ?? { n: 0, first: Date.now() };
    r.n++;
    fails.set(ip, r);
    if (fails.size > 5000) fails.clear();
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  };

  const group = await db.group.findUnique({ where: { accessCode: code } });
  if (!group || !group.codeActive) return fail();
  fails.delete(ip);

  const members = await db.worker.findMany({ where: { groupId: group.id } });
  let student = members.find((w: any) => w.role === "student" && normName(w.name) === normName(name));
  if (!student) {
    const studentCount = members.filter((w: any) => w.role === "student").length;
    // The coordinator decides how many students the group has: once that many joined, nobody new can join.
    const cap = group.memberLimit ?? MAX_STUDENTS_PER_GROUP;
    if (studentCount >= Math.min(cap, MAX_STUDENTS_PER_GROUP)) return NextResponse.json({ error: "group is full" }, { status: 409 });
    student = await db.worker.create({
      data: { name, language: String(body.language ?? "en").slice(0, 2), area: "CLEANING", role: "student", groupId: group.id, dietary: [] },
    });
    await logAudit(null, "group", group.id, "join", "{name} joined group {group}", { name: student.name, group: group.name }, student.id);
  }

  const token = await createSession({ workerId: student.id, name: student.name, role: "student" });
  const res = NextResponse.json({
    id: student.id, name: student.name, role: "student", area: student.area, language: student.language, group: group.name,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    maxAge: 60 * 60 * 24, // students stay signed in for a day (shared phones)
  });
  return res;
}
