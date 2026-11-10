"use client";

import { useEffect, useState } from "react";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCan } from "@/lib/useSession";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { Pills, S } from "@/components/ui";
import { COUNTRY_CODES, OrderingConfig, WEEKDAYS, countryName } from "@/lib/ordering";
import { Info, Pill, Product, ProductThumb, td, th, useJson } from "@/components/ordering/common";
import ProductEditor from "@/components/ordering/ProductEditor";

const SECTIONS = ["rules", "products", "dietary", "reports"] as const;
const LABELS: Record<(typeof SECTIONS)[number], string> = { rules: "Ordering rules", products: "Products", dietary: "Dietary requirements", reports: "Reports & history" };

type Report = {
  totals: { orders: number; units: number; requests: number }; byStatus: Record<string, number>;
  groups: { group: string; orders: number; delivered: number; units: number }[];
  products: { product: string; unit: string; ordered: number; prepared: number; missing: number }[];
  history: { id: string; group: string; orderDate: string; status: string; units: number }[];
};

// CATALOGUE & ORDERING — the administrator manages products, quantities, brands/alternatives, dietary requirements and the
// ordering workflow. Managers see the same screen read-only, plus the reports.
export default function CataloguePage() {
  const { tr, locale } = useI18n();
  const canEdit = useCan("catalogue.manage");
  const canConfigure = useCan("ordering.configure");
  const canProducts = useCan("catalogue.products");   // admin, or a coordinator (only for the countries of their own groups)
  const canReports = useCan("reports.read");
  const myGroups = useJson<{ country?: string | null }[]>("/api/groups", []);
  const vis = useSectionVisibility("catalogueSections", SECTIONS);
  const info = useJson<Info | null>("/api/ordering", null);
  const products = useJson<Product[]>("/api/products", []);
  const dietary = useJson<{ id: string; name: string; description?: string | null }[]>("/api/dietary", []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = useJson<Report | null>(`/api/reports?from=${from}&to=${to}`, null);
  const [editing, setEditing] = useState<{ product: Product | null } | null>(null);
  const [cfg, setCfg] = useState<OrderingConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [newDiet, setNewDiet] = useState("");
  const [err, setErr] = useState("");
  const [countryFilter, setCountryFilter] = useState(""); // "" = every product, "ALL" = products for all countries, else a country code

  const refresh = () => { info.reload(); products.reload(); dietary.reload(); report.reload(); };
  useLiveRefresh(refresh, { models: ["product", "dietaryRequirement", "appSetting", "order", "orderLine", "studentRequest"] });
  useEffect(() => { if (info.data && !cfg) setCfg(info.data.config); }, [info.data, cfg]);

  async function saveRules() {
    if (!cfg) return;
    setErr(""); setSaved("");
    try { await api("/api/ordering", "PUT", cfg); setSaved(tr("Saved.")); info.reload(); }
    catch (e: any) { setErr(e?.message?.includes("at least one") ? tr("Choose at least one ordering day.") : saveError(e, tr)); }
  }
  async function addDiet() {
    if (!newDiet.trim()) return;
    try { await api("/api/dietary", "POST", { name: newDiet }); setNewDiet(""); dietary.reload(); }
    catch (e: any) { setErr(e?.status === 409 ? tr("That requirement already exists.") : saveError(e, tr)); }
  }
  async function delDiet(id: string) {
    try { await api(`/api/dietary/${id}`, "DELETE"); refresh(); } catch (e) { setErr(saveError(e, tr)); }
  }

  const names = dietary.data.map((d) => d.name);
  const R = report.data;
  // Admin: every product, any country. Coordinator: only products of the countries of their own groups.
  const myCountries = Array.from(new Set(myGroups.data.map((g) => g.country).filter((c): c is string => !!c)));
  const mayEdit = (p: Product) => canEdit || (canProducts && !!p.country && myCountries.includes(p.country));
  const shownProducts = products.data.filter((p) => !countryFilter || (countryFilter === "ALL" ? !p.country : p.country === countryFilter));

  return (
    <PanelShell title={tr("Catalogue & Ordering")} subtitle={tr("Products, standard quantities, dietary requirements and the ordering workflow.")} vis={vis} labels={LABELS}
      actions={canEdit || (canProducts && myCountries.length > 0) ? <button style={S.navDark} onClick={() => setEditing({ product: null })}>+ {tr("Add product")}</button> : undefined}>
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      {vis.shown.rules && cfg && (
        <PanelCard title={tr("Ordering rules")} subtitle={tr("Who orders, when ordering is open, and whether requests need approval.")}>
          <label style={S.label}>{tr("Who places the order?")}</label>
          <Pills options={["STUDENT_REQUESTS", "COORDINATOR_ORDERS"]} value={cfg.model} onChange={(m) => canConfigure && setCfg({ ...cfg, model: m })}
            label={(m) => (m === "STUDENT_REQUESTS" ? tr("Students send requests, coordinator approves") : tr("Coordinator orders for the group"))} />
          <label style={S.label}>{tr("Ordering days")}</label>
          <Pills multi options={["1", "2", "3", "4", "5", "6", "0"]} value={cfg.orderingDays.map(String)} label={(d) => tr(WEEKDAYS[Number(d)])}
            onChange={(v: string[]) => canConfigure && setCfg({ ...cfg, orderingDays: v.map(Number) })} />
          <label style={S.label}>{tr("Cut-off time")}</label>
          <input style={{ ...S.input, width: 120 }} type="time" value={cfg.cutoffTime} disabled={!canConfigure} onChange={(e) => setCfg({ ...cfg, cutoffTime: e.target.value })} />
          <label style={{ ...S.label, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={cfg.requireApproval} disabled={!canConfigure} onChange={(e) => setCfg({ ...cfg, requireApproval: e.target.checked })} />
            {tr("Student requests need the coordinator's approval")}
          </label>
          <label style={{ ...S.label, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={cfg.allowExceptions} disabled={!canConfigure} onChange={(e) => setCfg({ ...cfg, allowExceptions: e.target.checked })} />
            {tr("Students may request a different quantity (with a reason)")}
          </label>
          {canConfigure && (
            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <button style={{ ...S.primary, flex: "none", padding: "10px 22px" }} onClick={saveRules}>{tr("Save")}</button>
              {saved && <span style={{ fontSize: 12.5, color: "var(--green-dark)" }}>{saved}</span>}
            </div>
          )}
        </PanelCard>
      )}

      {vis.shown.products && (
        <PanelCard title={`${tr("Products")} (${shownProducts.length})`} flush
          action={<select style={{ ...S.input, width: 170 }} aria-label={tr("Country")} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="">{tr("All products")}</option>
            <option value="ALL">{tr("All countries")}</option>
            {COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
          </select>}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={th} /><th style={th}>{tr("Product")}</th><th style={th}>{tr("Country")}</th><th style={th}>{tr("Brand")}</th><th style={th}>{tr("Standard")}</th><th style={th}>{tr("Suitable for")}</th><th style={th}>{tr("Alternatives")}</th><th style={th} /></tr></thead>
            <tbody>
              {shownProducts.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td style={td}><ProductThumb p={p} /></td>
                  <td style={td}><strong>{p.name}</strong><div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{p.category}{!p.active && ` · ${tr("inactive")}`}</div>
                    {Object.entries(p.names ?? {}).length > 0 && <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{Object.entries(p.names ?? {}).map(([l, n]) => `${l.toUpperCase()}: ${n}`).join(" · ")}</div>}</td>
                  <td style={td}>{p.country ? countryName(p.country, locale) : tr("All countries")}</td>
                  <td style={td}>{p.brand ?? "—"}</td>
                  <td style={td}>{p.standardQty} {p.unit}</td>
                  <td style={{ ...td, fontSize: 12 }}>{p.dietaryTags.join(", ") || "—"}</td>
                  <td style={{ ...td, fontSize: 12 }}>{p.alternatives.map((a) => a.name).join(", ") || "—"}</td>
                  <td style={td}>{mayEdit(p) && <button style={S.small} onClick={() => setEditing({ product: p })}>{tr("Edit")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelCard>
      )}

      {vis.shown.dietary && (
        <PanelCard title={tr("Dietary requirements")} subtitle={tr("Register them on students (Groups & Orders) and tag the products that suit them.")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {dietary.data.map((d) => (
              <span key={d.id} style={{ fontSize: 12.5, padding: "5px 10px", borderRadius: 999, background: "var(--green-bg)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {d.name}{canEdit && <button onClick={() => delDiet(d.id)} aria-label={tr("Remove")} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>×</button>}
              </span>
            ))}
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.input} placeholder={tr("New requirement, e.g. Nut-free")} value={newDiet} maxLength={40} onChange={(e) => setNewDiet(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDiet()} />
              <button style={S.smallDark} onClick={addDiet}>{tr("Add")}</button>
            </div>
          )}
        </PanelCard>
      )}

      {vis.shown.reports && canReports && (
        <PanelCard title={tr("Reports & history")}
          action={<>
            <input style={{ ...S.input, width: 140 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input style={{ ...S.input, width: 140 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>}>
          {R && (
            <>
              <StatGrid>
                <StatCard n={R.totals.orders} label={tr("Orders")} />
                <StatCard n={R.totals.units} label={tr("Units ordered")} />
                <StatCard n={R.totals.requests} label={tr("Student requests")} />
                <StatCard n={R.byStatus.DELIVERED ?? 0} label={tr("Delivered")} color="#4F7A26" />
              </StatGrid>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 14 }}>
                  <thead><tr><th style={th}>{tr("Group")}</th><th style={th}>{tr("Orders")}</th><th style={th}>{tr("Delivered")}</th><th style={th}>{tr("Units")}</th></tr></thead>
                  <tbody>{R.groups.map((g) => <tr key={g.group}><td style={td}>{g.group}</td><td style={td}>{g.orders}</td><td style={td}>{g.delivered}</td><td style={td}>{g.units}</td></tr>)}</tbody>
                </table>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 14 }}>
                  <thead><tr><th style={th}>{tr("Product")}</th><th style={th}>{tr("Ordered")}</th><th style={th}>{tr("Prepared")}</th><th style={th}>{tr("Missing")}</th></tr></thead>
                  <tbody>{R.products.map((p) => <tr key={p.product}><td style={td}>{p.product}</td><td style={td}>{p.ordered} {p.unit}</td><td style={td}>{p.prepared}</td><td style={{ ...td, color: p.missing ? "var(--red)" : undefined }}>{p.missing || "—"}</td></tr>)}</tbody>
                </table>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr><th style={th}>{tr("Date")}</th><th style={th}>{tr("Group")}</th><th style={th}>{tr("Units")}</th><th style={th}>{tr("Status")}</th></tr></thead>
                  <tbody>{R.history.map((h) => <tr key={h.id}><td style={td}>{h.orderDate}</td><td style={td}>{h.group}</td><td style={td}>{h.units}</td><td style={td}><Pill status={h.status} /></td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </PanelCard>
      )}

      {editing && <ProductEditor product={editing.product} dietary={names} countries={canEdit ? null : myCountries} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </PanelShell>
  );
}
