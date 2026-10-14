// "just now", "20 minutes ago", "1 hour ago", "yesterday" … in the viewer's language.
export function timeAgo(date: string | Date, locale: string, now = Date.now()): string {
  const secs = Math.round((new Date(date).getTime() - now) / 1000); // negative = past
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(secs);
  if (abs < 45) return rtf.format(0, "second");           // "now"
  if (abs < 3600) return rtf.format(Math.round(secs / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(secs / 86400), "day");
  return new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short" });
}
