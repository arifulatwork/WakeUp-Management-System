// A house can exist twice under the same name: once in SCHOOL mode (students group, the house is
// one single block) and once in TOURISM mode (summer, guests). Two houses are "the same" only
// when both the name and the mode match.
export const HOUSE_MODES = ["SCHOOL", "TOURISM"] as const;
export type HouseMode = (typeof HOUSE_MODES)[number];

export const normMode = (m: unknown): HouseMode => (m === "TOURISM" ? "TOURISM" : "SCHOOL");

// Ignores capitals, extra spaces and accents, so "Villa 1" / " villa  1 " / "VILLA 1" count as the same, and "Café" / "cafe" too.
export const normName = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// The value stored in House.nameKey. The database has a UNIQUE index on (nameKey, mode), which is
// what really stops two people from creating the same house at the same moment.
export const nameKey = normName;

// True when a create/update failed because of that unique index (Prisma P2002, or the demo database's copy of it).
export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export function findDuplicate<T extends { id: string; name: string; mode?: string | null }>(
  houses: T[], name: string, mode: string, ignoreId?: string,
): T | undefined {
  const n = normName(name);
  if (!n) return undefined;
  return houses.find((h) => h.id !== ignoreId && normName(h.name) === n && normMode(h.mode) === normMode(mode));
}

export const MAX_ROOM_PHOTOS = 30;
export const MAX_CHECKIN_TEXT = 5000;
