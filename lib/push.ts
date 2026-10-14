import webpush from "web-push";
import { db } from "@/lib/db";
import { pushText, PushKey } from "@/lib/pushText";

// PHONE NOTIFICATIONS (Web Push) — optional. Without VAPID keys in .env everything
// here quietly does nothing, so the app works exactly as before.
//
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   -> npm run vapid  (prints a pair)
//   VAPID_SUBJECT                          -> "mailto:you@example.com"
//
// Messages are sent in each recipient's saved language, and never block the action
// that caused them (a failing push can't make "Mark ready" fail).

export const STAFF_ROLES = ["coordinator", "manager", "admin"];

let ready: boolean | null = null;
export function pushConfigured(): boolean {
  if (ready !== null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (ready = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    ready = true;
  } catch (e) {
    console.error("[push] invalid VAPID keys — notifications are off", e);
    ready = false;
  }
  return ready;
}

// Where tapping the notification should open.
const homeFor = (w: { role: string; area: string }) =>
  w.role === "worker" ? (w.area === "MAINTENANCE" ? "/maintenance" : "/cleaner") : "/coordinator";

export type PushTarget = {
  workerIds?: string[];
  roles?: string[];
  area?: string; // "CLEANING" | "MAINTENANCE"
  excludeWorkerId?: string | null; // don't notify the person who just did the thing
};

export async function sendPush(target: PushTarget, key: PushKey, params: Record<string, string | number> = {}, tag?: string) {
  if (!pushConfigured()) return;
  const workers = await db.worker.findMany({
    where: target.workerIds ? { id: { in: target.workerIds } } : target.roles ? { role: { in: target.roles } } : undefined,
  });
  const people = workers.filter(
    (w: any) => (!target.area || w.area === target.area) && w.id !== target.excludeWorkerId
  );
  if (!people.length) return;
  const byId = new Map<string, any>(people.map((w: any) => [w.id, w]));
  const subs = await db.pushSubscription.findMany({ where: { workerId: { in: people.map((w: any) => w.id) } } });

  await Promise.allSettled(
    subs.map(async (s: any) => {
      const w = byId.get(s.workerId);
      if (!w) return;
      const { title, body } = pushText(key, w.language, params);
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: homeFor(w), tag }),
          { TTL: 60 * 60 * 6, urgency: key === "ticket_urgent" ? "high" : "normal" }
        );
      } catch (e: any) {
        // 404 / 410 = the phone unsubscribed or the app was removed: forget it.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        } else {
          console.error("[push] send failed", e?.statusCode ?? e?.message ?? e);
        }
      }
    })
  );
}

// Fire and forget — the caller does not wait.
export function pushAsync(target: PushTarget, key: PushKey, params: Record<string, string | number> = {}, tag?: string) {
  sendPush(target, key, params, tag).catch((e) => console.error("[push]", e));
}
