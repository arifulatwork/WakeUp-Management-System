// One place for every "what order should this list be in?" decision, so the
// whole app behaves consistently. Pure functions — no React in here.

export type Dir = "asc" | "desc";

// Lower = more urgent / earlier in the list.
export const PRIORITY_RANK: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2 };
export const TASK_STATUS_RANK: Record<string, number> = {
  WITH_ISSUE: 0, TO_BE_VERIFIED: 1, IN_PROGRESS: 2, ASSIGNED: 3, SCHEDULED: 4, ON_HOLD: 5, COMPLETED: 6, APPROVED: 7,
};
export const KEY_RANK: Record<string, number> = { MISSING: 0, WITH_CLEANER: 1, WITH_GUEST: 2, AT_OFFICE: 3 };
export const ROLE_RANK: Record<string, number> = { admin: 0, manager: 1, coordinator: 2, worker: 3 };
export const AREA_RANK: Record<string, number> = { CLEANING: 0, MAINTENANCE: 1 };
export const DONE_TASK = ["TO_BE_VERIFIED", "COMPLETED", "APPROVED"];

const p2 = (n: number) => String(n).padStart(2, "0");

// "2026-10-11" in LOCAL time (the date the person actually sees).
export function dayKey(v: string | Date): string {
  const d = new Date(v);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// Sortable "when": calendar day first, then the HH:MM of the job.
// (Sorting on the date alone leaves same-day jobs in random order.)
export const taskWhen = (t: { scheduledDate: string | Date; scheduledTime: string }) =>
  `${dayKey(t.scheduledDate)} ${t.scheduledTime}`;

export const cmpText = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "");
export const cmpNum = (a: number, b: number) => a - b;
export const applyDir = (c: number, dir: Dir) => (dir === "asc" ? c : -c);

// ---- tickets (shared by Maintenance, Ops, Coordinator) ----
export type TicketSort = "priority" | "newest" | "oldest" | "house";
type SortableTicket = { priority: string; reportedAt: string; house: { name: string } };

export function sortTickets<T extends SortableTicket>(list: T[], mode: TicketSort = "priority"): T[] {
  const time = (t: T) => new Date(t.reportedAt).getTime();
  return [...list].sort((a, b) => {
    if (mode === "newest") return time(b) - time(a);
    if (mode === "oldest") return time(a) - time(b);
    if (mode === "house") {
      return cmpText(a.house.name, b.house.name) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || time(a) - time(b);
    }
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || time(a) - time(b); // urgent first, then longest-waiting
  });
}
