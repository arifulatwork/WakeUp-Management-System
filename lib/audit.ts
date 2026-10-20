import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { renderEnglish } from "@/lib/auditText";
import { cachedValue } from "@/lib/serverCache";

// AUDIT TRAIL — who changed what, and when.
//
// Every route that changes data calls logAudit() after it succeeds. The actor is
// the signed-in person (manager / coordinator / admin) if there is a session,
// otherwise the field worker the job belongs to (signed-in field staff),
// otherwise "Field app". Only field NAMES are recorded for edits, never values,
// so passwords and photos can never end up in the log.
//
// A failing log write never breaks the real action.

export type AuditEntity = "task" | "ticket" | "material" | "house" | "staff" | "system";

export async function actorFor(req: NextRequest | null, fallbackWorkerId?: string | null) {
  try {
    if (req) {
      const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
      if (session) {
        const w = await cachedValue<any>(`worker:${session.workerId}`, ["worker"], () => db.worker.findUnique({ where: { id: session.workerId } }));
        if (w) return { id: w.id as string, name: w.name as string, role: w.role as string };
      }
    }
    if (fallbackWorkerId) {
      const w = await cachedValue<any>(`worker:${fallbackWorkerId}`, ["worker"], () => db.worker.findUnique({ where: { id: fallbackWorkerId } }));
      if (w) return { id: w.id as string, name: w.name as string, role: w.role as string };
    }
  } catch {
    /* fall through */
  }
  return { id: null as string | null, name: "Field app", role: "worker" };
}

// `template` is an English sentence with {placeholders}; `params` fills them in.
// The viewer's browser translates the template (lib/auditText.ts), so a Portuguese
// manager and a Ukrainian admin each read the same entry in their own language.
export async function logAudit(
  req: NextRequest | null,
  entity: AuditEntity,
  entityId: string | null,
  action: string,
  template: string,
  params: Record<string, string | number> = {},
  fallbackWorkerId?: string | null
) {
  try {
    const actor = req === null && !fallbackWorkerId
      ? { id: null, name: "System", role: "system" }
      : await actorFor(req, fallbackWorkerId);
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        entity,
        entityId,
        action,
        template,
        params,
        summary: renderEnglish(template, params).slice(0, 300), // English fallback
      },
    });
  } catch (e) {
    console.error("[audit] could not write log entry", e);
  }
}

// "status,priority,notes" from an update body — field names only, translated when shown.
export const changedFields = (fields: Record<string, unknown> | undefined) =>
  Object.keys(fields ?? {}).join(",") || "—";
