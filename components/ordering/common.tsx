"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { OrderingConfig, WEEKDAYS, WindowState, countryOptions } from "@/lib/ordering";
import { S } from "@/components/ui";

// Small pieces shared by the four ordering screens (student, supplier, groups & orders, catalogue).

export type Product = {
  id: string; name: string; category: string; unit: string; brand: string | null; standardQty: number;
  dietaryTags: string[]; alternatives: { id: string; name: string; brand?: string; dietaryTags: string[] }[]; active: boolean;
  names?: Record<string, string>; photo?: string | null; country?: string | null; // name per language, catalogue photo, country (null = all)
};
export type Line = {
  id: string; productId: string; quantity: number; product?: Product | null; alternativeName?: string | null;
  status?: string; preparedQty?: number | null; missingNote?: string | null; substituteName?: string | null;
  // request lines
  standardQty?: number; exceptionReason?: string | null; lineStatus?: string; approvedQty?: number | null; dietaryFlag?: string | null;
};
export type Order = {
  id: string; groupId: string; orderDate: string; status: string; note?: string | null; group?: { id: string; name: string } | null;
  approvedAt?: string | null; preparedAt?: string | null; dispatchedAt?: string | null; deliveredAt?: string | null; lines: Line[];
};
export type Req = {
  id: string; orderDate: string; status: string; decisionNote?: string | null; createdAt: string;
  student?: { id: string; name: string; dietary: string[] } | null; group?: { id: string; name: string } | null; lines: Line[];
};
export type Info = { config: OrderingConfig; window: WindowState };

// Small catalogue photo of a product (a neutral box when it has none, so lists line up).
export function ProductThumb({ p, size = 44 }: { p?: { photo?: string | null } | null; size?: number }) {
  const box: React.CSSProperties = { width: size, height: size, borderRadius: 8, border: "1px solid var(--line)", background: "#F3F2EE", flex: "none", display: "block" };
  // eslint-disable-next-line @next/next/no-img-element
  return p?.photo ? <img src={p.photo} alt="" loading="lazy" decoding="async" style={{ ...box, objectFit: "cover" }} /> : <span style={box} aria-hidden />;
}

// Country dropdown: the standard list of countries, always full width of its box (never squeezes the text next to it).
// `firstLabel` = the empty choice at the top ("All countries" / "—"); leave undefined for no empty choice.
export function CountrySelect({ value, onChange, firstLabel, only, ariaLabel }: {
  value: string; onChange: (code: string) => void; firstLabel?: string; only?: string[] | null; ariaLabel?: string;
}) {
  const { locale } = useI18n();
  return (
    <select aria-label={ariaLabel} style={{ ...S.input, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }} value={value} onChange={(e) => onChange(e.target.value)}>
      {firstLabel !== undefined && <option value="">{firstLabel}</option>}
      {countryOptions(locale, only).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  );
}

export const altLabel = (a: { name: string; brand?: string }) => `${a.name}${a.brand ? ` (${a.brand})` : ""}`;
export const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
export const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "top" };

const COLORS: Record<string, string> = {
  PENDING: "#FAF3D6", OPEN: "#FAF3D6", APPROVED: "#E6F0F8", PREPARING: "#FBEDDB", PREPARED: "#E8F1DD",
  DISPATCHED: "#E6F0F8", DELIVERED: "var(--green-bg)", REJECTED: "var(--red-bg)", CANCELLED: "#EEE", UNAVAILABLE: "var(--red-bg)",
};
export function Pill({ status }: { status: string }) {
  const { ev } = useI18n();
  return <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: COLORS[status] ?? "#EEE", textTransform: "uppercase", whiteSpace: "nowrap" }}>{ev(status)}</span>;
}

// Open -> Sent -> Preparing -> Prepared -> Dispatched -> Delivered, with the current step marked.
const FLOW: [string, string][] = [["OPEN", "Open"], ["APPROVED", "Sent"], ["PREPARING", "Preparing"], ["PREPARED", "Prepared"], ["DISPATCHED", "Dispatched"], ["DELIVERED", "Delivered"]];
export function Flow({ status }: { status: string }) {
  const { tr } = useI18n();
  if (status === "CANCELLED") return <Pill status="CANCELLED" />;
  const at = FLOW.findIndex(([k]) => k === status);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {FLOW.map(([k, label], i) => (
        <span key={k} style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 999, fontWeight: i === at ? 700 : 500,
          background: i < at ? "var(--green-bg)" : i === at ? "var(--ink)" : "#F2F2F2", color: i === at ? "#fff" : "var(--ink-soft)" }}>
          {i < at ? "✓ " : ""}{tr(label)}
        </span>
      ))}
    </div>
  );
}

// "Ordering is open until 18:00" / "closed — opens Monday".
export function OrderingBanner({ info }: { info: Info | null }) {
  const { tr } = useI18n();
  if (!info) return null;
  const { config, window: w } = info;
  const text = w.open
    ? tr("Ordering is open until {time}.", { time: config.cutoffTime })
    : w.reason === "CUTOFF"
      ? tr("Ordering closed for today (cut-off {time}).", { time: config.cutoffTime })
      : tr("Ordering is closed today. Next ordering day: {day}.", { day: w.nextDay != null ? tr(WEEKDAYS[w.nextDay]) : "—" });
  return (
    <div style={{ background: w.open ? "var(--green-bg)" : "#FAF3D6", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 16 }}>
      <strong>{w.open ? "🟢 " : "🟡 "}{text}</strong>{" "}
      <span style={{ color: "var(--ink-soft)" }}>
        {config.model === "STUDENT_REQUESTS" ? tr("Students send requests; the coordinator approves them.") : tr("The coordinator places the order for the group.")}
      </span>
    </div>
  );
}

// Loads a URL as JSON and keeps it fresh: call reload() after a change. Pass the models to refresh on via useLiveRefresh in the page.
export function useJson<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch { /* offline: keep the last data */ }
    setLoaded(true);
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload, loaded };
}

export function Stepper({ value, onChange, min = 0, max = 99, disabled }: { value: number; onChange: (n: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const b: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", fontSize: 16, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" style={b} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="−">−</button>
      <span style={{ minWidth: 22, textAlign: "center", fontWeight: 600 }}>{value}</span>
      <button type="button" style={b} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="+">+</button>
    </span>
  );
}

export const when = (iso?: string | null, locale = "en-GB") => (iso ? new Date(iso).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// Total units in an order's lines.
export const unitsOf = (lines: Line[]) => lines.reduce((n, l) => n + l.quantity, 0);
