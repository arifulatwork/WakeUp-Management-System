// Minutes as people read them: 45 → "45 min", 60 → "1 h", 90 → "1 h 30 min", 150 → "2 h 30 min".
// Under an hour it stays in minutes. Uses the short units "h" and "min", which read the same in every language.
export function formatMinutes(total: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(total) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
