import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySession, SESSION_COOKIE, SessionPayload } from "@/lib/session";
import { can, Perm } from "@/lib/permissions";
import { cachedValue } from "@/lib/serverCache";

// Server-side enforcement. Hiding a button is not security — every route that
// changes or exposes management data calls requirePerm().
//
// The role is read from the DATABASE on every call, not from the cookie, so
// when a Super Admin demotes someone (or removes them) it takes effect on their
// very next request instead of whenever their 7-day cookie expires.

export type FullSession = SessionPayload & { area?: string; language?: string };

export async function currentSession(req: NextRequest): Promise<FullSession | null> {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // Read from memory; the database is asked again only after the Worker table was written to
  // (role change, rename, delete), so a demotion still applies on the very next request.
  const worker = await cachedValue<any>(`worker:${session.workerId}`, ["worker"], () => db.worker.findUnique({ where: { id: session.workerId } }));
  if (!worker) return null;
  return { ...session, role: worker.role, name: worker.name, area: worker.area, language: worker.language };
}

// Who is really performing a field action (start a job, report an issue, request materials…)?
// Cleaners and maintenance staff are always themselves: whatever worker id the browser sends is
// ignored and the id from their login is used, so nobody can act as a colleague.
// Office roles (admin/manager/coordinator) keep the id they send, which is what the Super Admin
// "open the app as this person" support tool relies on.
export async function actingWorkerId(req: NextRequest, claimed?: unknown): Promise<string | undefined> {
  const s = await currentSession(req);
  if (s?.role === "worker") return s.workerId;
  return typeof claimed === "string" && claimed ? claimed : undefined;
}

export async function requirePerm(
  req: NextRequest,
  perm: Perm
): Promise<{ session: SessionPayload; error?: undefined } | { session?: undefined; error: NextResponse }> {
  const session = await currentSession(req);
  if (!session) return { error: NextResponse.json({ error: "sign in required" }, { status: 401 }) };
  if (!can(session.role, perm)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}
