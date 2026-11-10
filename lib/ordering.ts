// ORDERING — shared constants and small pure helpers for the product-ordering feature
// (students / coordinators / suppliers). Safe to import from server routes AND browser screens.

export type OrderingModel = "STUDENT_REQUESTS" | "COORDINATOR_ORDERS";

// What the Administrator configures (Catalogue & Ordering -> Ordering rules).
export type OrderingConfig = {
  model: OrderingModel;       // who places the order: students send requests, or the coordinator orders for the group
  orderingDays: number[];     // weekdays when ordering is open (0 = Sunday ... 6 = Saturday)
  cutoffTime: string;         // "HH:MM" — ordering closes at this time on an ordering day
  requireApproval: boolean;   // student requests need the coordinator's approval (off = auto-approved unless a quantity exception)
  allowExceptions: boolean;   // students may ask for a quantity different from the standard one (with a reason)
};

export const DEFAULT_ORDERING: OrderingConfig = {
  model: "STUDENT_REQUESTS",
  orderingDays: [1, 2, 3, 4, 5],
  cutoffTime: "18:00",
  requireApproval: true,
  allowExceptions: true,
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function cleanOrdering(v: any): OrderingConfig {
  const d = DEFAULT_ORDERING;
  const model: OrderingModel = v?.model === "COORDINATOR_ORDERS" ? "COORDINATOR_ORDERS" : "STUDENT_REQUESTS";
  const days = Array.isArray(v?.orderingDays)
    ? Array.from(new Set(v.orderingDays.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))).sort() as number[]
    : d.orderingDays;
  const cutoffTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v?.cutoffTime ?? "")) ? String(v.cutoffTime) : d.cutoffTime;
  return {
    model,
    orderingDays: days,
    cutoffTime,
    requireApproval: typeof v?.requireApproval === "boolean" ? v.requireApproval : d.requireApproval,
    allowExceptions: typeof v?.allowExceptions === "boolean" ? v.allowExceptions : d.allowExceptions,
  };
}

// "2026-11-02" in the server's local time. One ordering day = one round of orders (Order.orderDate).
export function dateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type WindowState = { open: boolean; reason?: "DAY" | "CUTOFF"; nextDay?: number };

// Is ordering open right now? Open on an ordering day, before the cut-off time.
export function orderingWindow(cfg: OrderingConfig, now: Date = new Date()): WindowState {
  if (!cfg.orderingDays.includes(now.getDay())) {
    const next = [1, 2, 3, 4, 5, 6, 7].map((i) => (now.getDay() + i) % 7).find((d) => cfg.orderingDays.includes(d));
    return { open: false, reason: "DAY", nextDay: next };
  }
  const [h, m] = cfg.cutoffTime.split(":").map(Number);
  const cut = new Date(now); cut.setHours(h, m, 0, 0);
  if (now >= cut) return { open: false, reason: "CUTOFF" };
  return { open: true };
}

// ---- statuses ----
export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const ORDER_STATUSES = ["OPEN", "APPROVED", "PREPARING", "PREPARED", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;
export const LINE_STATUSES = ["PENDING", "PREPARED", "UNAVAILABLE"] as const;
// Orders the supplier can see (the coordinator has sent them on).
export const SUPPLIER_STATUSES = ["APPROVED", "PREPARING", "PREPARED", "DISPATCHED", "DELIVERED"];

// ---- group codes ----
// No 0/O/1/I/L so a code read out loud or copied from a screen can't be mistyped.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const showCode = (c: string) => (c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

// ---- dietary ----
// Requirements of a student that a product does NOT cover (product tags = requirements it suits).
export const dietaryGaps = (studentReqs: string[] | null | undefined, tags: string[] | null | undefined): string[] =>
  (studentReqs ?? []).filter((r) => !(tags ?? []).includes(r));

export type Alternative = { id: string; name: string; brand?: string; dietaryTags: string[] };

export const MAX_QTY = 99;

// ---- countries & product languages ----
// Each group belongs to a country; a product is sold in one country (or in all of them when country is empty).
// Add a country by adding its two-letter code here.
export const COUNTRY_CODES = ["PT", "ES", "FR", "IT", "DE", "GB", "IE", "NL", "BE", "PL", "UA", "US"];
export const cleanCountry = (v: unknown): string | null => {
  const c = String(v ?? "").trim().toUpperCase();
  return COUNTRY_CODES.includes(c) ? c : null;
};
// "PT" -> "Portugal" / "Portugal" / "Portogallo" … in the language of the screen.
export function countryName(code: string, locale = "en-GB"): string {
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; } catch { return code; }
}
// Keep in step with LANGS in lib/i18n.tsx (that file is browser-only, so the codes are repeated here).
export const PRODUCT_LANGS = ["en", "pt", "es", "fr", "it", "uk"];
// The product name in the viewer's language; the default name when that language was not filled in.
export const productName = (p: { name: string; names?: unknown }, lang: string): string => {
  const n = (p.names as Record<string, unknown> | null | undefined)?.[lang];
  return typeof n === "string" && n.trim() ? n.trim() : p.name;
};
// A product with no country is for everybody; otherwise it must match the group's country.
export const productInCountry = (p: { country?: string | null }, country?: string | null): boolean =>
  !p.country || p.country === (country ?? null);
