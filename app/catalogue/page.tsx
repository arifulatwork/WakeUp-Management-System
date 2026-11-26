"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
import { LoadError, SkeletonRows } from "@/components/PanelKit";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCan } from "@/lib/useSession";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useStages, useStagesAdvance } from "@/lib/useStagedLoad";
import { Pills, S } from "@/components/ui";
import { OrderingConfig, WEEKDAYS, countryName, countryOptions } from "@/lib/ordering";
import { CountrySelect, Info, Pill, Product, ProductThumb, td, th, useJson } from "@/components/ordering/common";
import { Pager, norm } from "@/components/ordering/Pager";

// The product pop-up is only downloaded when somebody opens it.
const ProductEditor = dynamic(() => import("@/components/ordering/ProductEditor"), { ssr: false });

const PRODUCTS_PER_PAGE = 15;
// One tab per section. Only the open tab loads its data (NEEDS), so the screen no longer asks the server
// for products, rules, dietary requirements and the report at the same moment. The open tab is kept in
// the address (#rules).
const TABS = ["products", "rules", "dietary", "reports"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { products: "Products", rules: "Ordering rules", dietary: "Dietary requirements", reports: "Reports & history" };
type Res = "info" | "products" | "dietary" | "report" | "groups";
const NEEDS: Record<Tab, Res[]> = { products: ["products"], rules: ["info"], dietary: ["dietary"], reports: ["report"] };

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
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "products");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Coordinators may edit only the products of their own groups' countries, so for them the group list is needed
  // too (it loads right after the open tab's list). The dietary list is needed by the product pop-up.
  const needsGroups = !canEdit && canProducts;
  const [wantDietary, setWantDietary] = useState(false);
  const want: Res[] = tab === "reports" && !canReports ? [] : [...NEEDS[tab]]; // the report is only for roles that may read it
  if (needsGroups) want.push("groups");
  if (wantDietary && !want.includes("dietary")) want.push("dietary");
  const stages = useStages(want);
  const on = stages.on;

  const myGroups = useJson<{ country?: string | null }[]>(on("groups") ? "/api/groups" : null, []);
  const info = useJson<Info | null>(on("info") ? "/api/ordering" : null, null);
  const products = useJson<Product[]>(on("products") ? "/api/products" : null, []);
  const dietary = useJson<{ id: string; name: string; description?: string | null }[]>(on("dietary") ? "/api/dietary" : null, []);
  const report = useJson<Report | null>(on("report") ? `/api/reports?from=${from}&to=${to}` : null, null);
  useStagesAdvance(stages, { info: info.loaded, products: products.loaded, dietary: dietary.loaded, report: report.loaded, groups: myGroups.loaded });
  const [editing, setEditing] = useState<{ product: Product | null } | null>(null);
  const [cfg, setCfg] = useState<OrderingConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [newDiet, setNewDiet] = useState("");
  const [err, setErr] = useState("");
  const [countryFilter, setCountryFilter] = useState(""); // "" = every product, "ALL" = products for all countries, else a country code
  const [categoryFilter, setCategoryFilter] = useState(""); // "" = every category
  const [q, setQ] = useState("");
  const [stock, setStock] = useState<"available" | "unavailable">("available"); // which sub-tab of Products is open
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleErr, setToggleErr] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, countryFilter, categoryFilter, stock]);

  const refresh = () => { info.reload(); products.reload(); dietary.reload(); report.reload(); };
  useLiveRefresh(refresh, { models: ["product", "dietaryRequirement", "appSetting", "order", "orderLine", "studentRequest"] });
  useEffect(() => { if (info.data && !cfg) setCfg(info.data.config); }, [info.data, cfg]);

  // Opening the product pop-up starts loading the dietary list it needs.
  const openEditing = (product: Product | null) => { setWantDietary(true); setEditing({ product }); };
  // A list that has not arrived (or could not be loaded) shows grey rows / a retry button instead of "nothing here".
  type L = { loaded: boolean; error: boolean; data: unknown; reload: () => void };
  const blocked = (q: L) => !q.loaded || (q.error && (Array.isArray(q.data) ? q.data.length === 0 : !q.data));
  const waiting = (q: L, rows = 4) => (q.error ? <LoadError onRetry={q.reload} /> : <SkeletonRows rows={rows} />);

  // Switch a product on/off for ordering straight from the list (no need to open the pop-up).
  async function toggleActive(p: Product) {
    setToggling(p.id); setToggleErr("");
    try { await api(`/api/products/${p.id}`, "PATCH", { active: !p.active }); products.reload(); }
    catch (e) { setToggleErr(saveError(e, tr)); }
    setToggling(null);
  }

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
  // the filter only lists countries that have products
  const usedCountries = Array.from(new Set(products.data.map((p) => p.country).filter((c): c is string => !!c)));
  const mayEdit = (p: Product) => canEdit || (canProducts && !!p.country && myCountries.includes(p.country));
  // the category filter lists the categories that exist (the sections: Food, Drinks, …)
  const categories = Array.from(new Set(products.data.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const needle = norm(q.trim());
  const shownProducts = products.data.filter((p) =>
    (!countryFilter || (countryFilter === "ALL" ? !p.country : p.country === countryFilter)) &&
    (!categoryFilter || p.category === categoryFilter) &&
    (stock === "available") === p.active &&
    (!needle || [p.name, p.brand, p.category, ...Object.values(p.names ?? {})].some((v) => norm(v).includes(needle))));
  const pages = Math.max(1, Math.ceil(shownProducts.length / PRODUCTS_PER_PAGE));
  const curPage = Math.min(page, pages);
  const pagedProducts = shownProducts.slice((curPage - 1) * PRODUCTS_PER_PAGE, curPage * PRODUCTS_PER_PAGE);

  return (
    <PanelShell title={tr("Catalogue & Ordering")} subtitle={tr("Products, standard quantities, dietary requirements and the ordering workflow.")} actions={canEdit || (canProducts && myCountries.length > 0) ? <button style={S.navDark} onClick={() => openEditing(null)}>+ {tr("Add product")}</button> : undefined}>
      <PanelTabs
        tabs={TABS.filter((t) => t !== "reports" || canReports).map((t) => ({ id: t, label: tr(TAB_LABEL[t]) }))}
        value={tab}
        onChange={chooseTab}
        label={tr("Catalogue & Ordering")}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      {tab === "rules" && (!cfg ? <PanelCard title={tr("Ordering rules")} flush>{waiting(info)}</PanelCard> : (
        <PanelCard title={tr("Ordering rules")} subtitle={tr("Who orders, when ordering is open, and whether requests need approval.")}>
          <label style={S.label}>{tr("Who places the order?")}</label>
          <Pills options={["STUDENT_REQUESTS", "COORDINATOR_ORDERS"]} value={cfg.model} onChange={(m) => canConfigure && setCfg({ ...cfg, model: m })}
            label={(m) => (m === "STUDENT_REQUESTS" ? tr("Students send requests, coordinator approves") : tr("Coordinator orders for the group"))} />
          <label style={S.label}>{tr("Ordering days")}</label>
          <Pills multi options={["1", "2", "3", "4", "5", "6", "0"]} value={cfg.orderingDays.map(String)} label={(d) => tr(WEEKDAYS[Number(d)])}
            onChange={(v: string[]) => canConfigure && setCfg({ ...cfg, orderingDays: v.map(Number) })} />
          <label style={S.label}>{tr("Delivery day")}</label>
          <select style={{ ...S.input, width: 220 }} value={cfg.deliveryDelayDays} disabled={!canConfigure} onChange={(e) => setCfg({ ...cfg, deliveryDelayDays: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? tr("Same day") : n === 1 ? tr("The day after the order") : tr("{n} days after the order", { n })}</option>)}
          </select>
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
      ))}

      {tab === "products" && (
        <PanelCard title={products.loaded ? `${tr("Products")} (${shownProducts.length})` : tr("Products")} flush>
          {blocked(products) ? waiting(products) : (
          <>
          <div style={{ padding: "12px 14px 10px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "2 1 220px", minWidth: 0 }}>
              <label style={S.label}>{tr("Search")}</label>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} aria-label={tr("Search products, brands or categories…")}
                placeholder={tr("Search products, brands or categories…")} style={{ ...S.input, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <label style={S.label}>{tr("Category")}</label>
              <select aria-label={tr("Category")} style={{ ...S.input, width: "100%", minWidth: 0, boxSizing: "border-box" }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">{tr("All categories")}</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <label style={S.label}>{tr("Country")}</label>
              <select aria-label={tr("Country")} style={{ ...S.input, width: "100%", minWidth: 0, boxSizing: "border-box" }} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="">{tr("All products")}</option>
                <option value="ALL">{tr("All countries")}</option>
                {countryOptions(locale, usedCountries).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="h-tabs" style={{ marginTop: 4 }}>
            <PanelTabs<"available" | "unavailable">
              tabs={[
                { id: "available", label: `${tr("Available")} · ${products.data.filter((p) => p.active).length}` },
                { id: "unavailable", label: `${tr("Unavailable")} · ${products.data.filter((p) => !p.active).length}` },
              ]}
              value={stock} onChange={setStock} label={tr("Products")} />
          </div>
          {toggleErr && <p role="alert" style={{ margin: 0, padding: "6px 14px", fontSize: 12.5, color: "var(--red)" }}>{toggleErr}</p>}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={th} /><th style={th}>{tr("Product")}</th><th style={th}>{tr("Country")}</th><th style={th}>{tr("Standard")}</th><th style={th}>{tr("Suitable for")}</th><th style={th}>{tr("Alternatives")}</th><th style={th}>{tr("Status")}</th><th style={th} /></tr></thead>
            <tbody>
              {pagedProducts.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td style={td}><ProductThumb p={p} /></td>
                  <td style={td}><strong>{p.name}</strong><div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{p.category}</div>
                    {Object.entries(p.names ?? {}).length > 0 && <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{Object.entries(p.names ?? {}).map(([l, n]) => `${l.toUpperCase()}: ${n}`).join(" · ")}</div>}</td>
                  <td style={td}>{p.country ? countryName(p.country, locale) : tr("All countries")}</td>
                  <td style={td}>{p.standardQty} {p.unit}</td>
                  <td style={{ ...td, fontSize: 12 }}>{p.dietaryTags.join(", ") || "—"}</td>
                  <td style={{ ...td, fontSize: 12 }}>{p.alternatives.map((a) => a.name).join(", ") || "—"}</td>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontSize: 12, color: p.active ? "var(--green-dark)" : "var(--ink-soft)", fontWeight: 600 }}>
                      {mayEdit(p) ? (
                        <button type="button" role="switch" aria-checked={p.active} aria-label={`${p.name}: ${p.active ? tr("Available") : tr("Unavailable")}`}
                          disabled={toggling === p.id} onClick={() => toggleActive(p)} className={`switch${p.active ? " on" : ""}`}><span /></button>
                      ) : <span className={`switch${p.active ? " on" : ""}`} aria-hidden="true"><span /></span>}
                      {p.active ? tr("Available") : tr("Unavailable")}
                    </span>
                  </td>
                  <td style={td}>{mayEdit(p) && <button style={S.small} onClick={() => openEditing(p)}>{tr("Edit")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shownProducts.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{stock === "unavailable" && !products.data.some((p) => !p.active) ? tr("No unavailable products.") : tr("No matching products.")}</p>}
          <Pager page={curPage} pages={pages} onPage={setPage} />
          </>
          )}
        </PanelCard>
      )}

      {tab === "dietary" && (
        <PanelCard title={tr("Dietary requirements")} subtitle={tr("Register them on students (Groups & Orders) and tag the products that suit them.")}>
          {blocked(dietary) ? waiting(dietary) : (
          <>
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
          </>
          )}
        </PanelCard>
      )}

      {tab === "reports" && canReports && (
        <PanelCard title={tr("Reports & history")}
          action={<>
            <input style={{ ...S.input, width: 140 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input style={{ ...S.input, width: 140 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>}>
          {blocked(report) ? waiting(report) : R && (
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
      </div>

      {editing && dietary.loaded && <ProductEditor product={editing.product} dietary={names} countries={canEdit ? null : myCountries} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </PanelShell>
  );
}
