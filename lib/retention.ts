import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// RETENTION — closed maintenance tickets are kept for six months, then removed.
// Runs lazily (at most once an hour) whenever the ticket list is read, so there
// is no cron job to set up. With the real backend you can also call
// purgeOldClosedTickets() from a scheduled job.

export const RETENTION_MONTHS = 6;
const g = globalThis as unknown as { __lastTicketPurge?: number };

export async function purgeOldClosedTickets(now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const res = await db.maintenanceTicket.deleteMany({
    where: { status: "CLOSED", closedAt: { lt: cutoff } },
  });
  if (res.count > 0) {
    await logAudit(null, "system", null, "retention", "Removed {count} closed ticket(s) older than {months} months", { count: res.count, months: RETENTION_MONTHS });
  }
  return res.count;
}

export async function maybePurgeTickets() {
  const t = Date.now();
  if (g.__lastTicketPurge && t - g.__lastTicketPurge < 60 * 60 * 1000) return;
  g.__lastTicketPurge = t;
  try {
    await purgeOldClosedTickets();
    // The bell only shows the latest 50; older history rows are removed after 90 days.
    await db.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } });
  } catch (e) {
    console.error("[retention] purge failed", e);
  }
}
