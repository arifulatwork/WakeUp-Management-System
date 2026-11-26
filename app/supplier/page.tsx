"use client";

import { useMemo, useState } from "react";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
import { LoadError, SkeletonRows } from "@/components/PanelKit";
import { Pager } from "@/components/ordering/Pager";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { S } from "@/components/ui";
import { productName } from "@/lib/ordering";
import { altLabel, Flow, Line, Order, Pill, ProductThumb, td, th, unitsOf, useJson, when } from "@/components/ordering/common";

const ACTIVE = ["APPROVED", "PREPARING", "PREPARED"];
const DONE_PER_PAGE = 15;

// Three tabs: what is still to prepare (opens first), what is on the way, and the delivered history.
const TABS = ["prepare", "onTheWay", "delivered"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { prepare: "To prepare", onTheWay: "On the way", delivered: "Delivered" };

// SUPPLIER / WAREHOUSE SCREEN — approved orders, consolidated quantities, preparing each group's products,
// recording what is missing, and marking orders dispatched / delivered.
export default function SupplierPage() {
  const { tr, locale, lang } = useI18n();
  const orders = useJson<Order[]>("/api/orders", []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "prepare");
  const [donePage, setDonePage] = useState(1);
  useLiveRefresh(() => orders.reload(), { models: ["order", "orderLine", "product"] });

  const active = orders.data.filter((o) => ACTIVE.includes(o.status));
  const dispatched = orders.data.filter((o) => o.status === "DISPATCHED");
  // newest delivery first
  const done = orders.data.filter((o) => o.status === "DELIVERED").sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));
  const donePages = Math.max(1, Math.ceil(done.length / DONE_PER_PAGE));
  const curDonePage = Math.min(donePage, donePages);
  const doneShown = done.slice((curDonePage - 1) * DONE_PER_PAGE, curDonePage * DONE_PER_PAGE);
  const missing = orders.data.filter((o) => ACTIVE.includes(o.status)).flatMap((o) => o.lines).filter((l) => l.status === "UNAVAILABLE").length;

  // Consolidated: every product summed across the orders still to prepare, with how many groups need it.
  const consolidated = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; brand: string | null; total: number; done: number; parts: { group: string; qty: number; alt?: string | null }[] }>();
    for (const o of active) for (const l of o.lines) {
      const key = `${l.productId}|${l.alternativeName ?? ""}`;
      const row = m.get(key) ?? { name: l.product ? productName(l.product, lang) : "—", unit: l.product?.unit ?? "", brand: l.product?.brand ?? null, total: 0, done: 0, parts: [] };
      row.name = l.alternativeName ? `${l.product ? productName(l.product, lang) : ""} → ${l.alternativeName}` : row.name;
      row.total += l.quantity;
      if (l.status === "PREPARED") row.done += l.preparedQty ?? l.quantity;
      row.parts.push({ group: o.group?.name ?? "—", qty: l.quantity, alt: l.alternativeName });
      m.set(key, row);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [active, lang]);

  async function act(orderId: string, body: Record<string, unknown>) {
    setBusy(true); setErr("");
    try { await api(`/api/orders/${orderId}`, "PATCH", body); }
    catch (e: any) { setErr(e?.message === "prepare every product first (or mark it as unavailable)" ? tr("Prepare every product first (or mark it as unavailable).") : tr("Could not save. Please try again.")); }
    setBusy(false);
    orders.reload();
  }

  return (
    <PanelShell title={tr("Order Fulfilment")} subtitle={tr("Prepare each group's order, record what is missing, then dispatch and deliver.")}>
      <StatGrid>
        <StatCard n={active.length} label={tr("To prepare")} color="#B8860B" />
        <StatCard n={active.filter((o) => o.status === "PREPARED").length} label={tr("Ready to dispatch")} color="#4F7A26" />
        <StatCard n={dispatched.length} label={tr("On the way")} color="#2E6B8A" />
        <StatCard n={missing} label={tr("Missing products")} color="var(--red)" />
      </StatGrid>
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      <PanelTabs
        tabs={TABS.map((t) => ({
          id: t,
          label: tr(TAB_LABEL[t]),
          badge: !orders.loaded ? undefined : t === "prepare" ? active.length : t === "onTheWay" ? dispatched.length : undefined,
        }))}
        value={tab}
        onChange={chooseTab}
        label={tr("Order Fulfilment")}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {!orders.loaded || (orders.error && !orders.data.length) ? (
        <PanelCard flush>{orders.loaded ? <LoadError onRetry={orders.reload} /> : <SkeletonRows rows={4} />}</PanelCard>
      ) : (
      <>
      {tab === "prepare" && (
        <>
      <PanelCard title={tr("Consolidated quantities")} subtitle={tr("Everything to pick, summed over all groups still to prepare.")} flush>
        {!consolidated.length
          ? <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("Nothing to prepare right now.")}</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={th}>{tr("Product")}</th><th style={th}>{tr("Total")}</th><th style={th}>{tr("Prepared")}</th><th style={th}>{tr("Per group")}</th></tr></thead>
              <tbody>
                {consolidated.map((r) => (
                  <tr key={r.name}>
                    <td style={td}><strong>{r.name}</strong>{r.brand && <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{r.brand}</div>}</td>
                    <td style={td}><strong>{r.total}</strong> {r.unit}</td>
                    <td style={td}>{r.done}/{r.total}</td>
                    <td style={{ ...td, fontSize: 12, color: "var(--ink-soft)" }}>{r.parts.map((p) => `${p.group}: ${p.qty}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </PanelCard>


      {active.slice().sort((a, b) => a.orderDate.localeCompare(b.orderDate)).map((o) => (
        <OrderCard key={o.id} order={o} busy={busy} onAct={(b) => act(o.id, b)} locale={locale} />
      ))}
        </>
      )}

      {tab === "onTheWay" && (
        <>
          {!dispatched.length && <PanelCard><p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", textAlign: "center", padding: "6px 0" }}>{tr("Nothing on the way.")}</p></PanelCard>}
          {dispatched.slice().sort((a, b) => a.orderDate.localeCompare(b.orderDate)).map((o) => (
            <OrderCard key={o.id} order={o} busy={busy} onAct={(b) => act(o.id, b)} locale={locale} />
          ))}
        </>
      )}

      {tab === "delivered" && (
        <PanelCard title={`${tr("Delivered")} (${done.length})`} flush>
          {!done.length ? (
            <p style={{ margin: 0, padding: "22px 16px", fontSize: 13, textAlign: "center", color: "var(--ink-soft)" }}>{tr("No orders yet.")}</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F7F8F4" }}>
                      <th style={th}>{tr("Group")}</th>
                      <th style={th}>{tr("Date")}</th>
                      <th style={th}>{tr("Delivery")}</th>
                      <th style={{ ...th, textAlign: "center" }}>{tr("Units")}</th>
                      <th style={th}>{tr("Delivered")}</th>
                      <th style={{ ...th, textAlign: "right" }}>{tr("Received")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doneShown.map((o, i) => {
                      const cell: React.CSSProperties = { ...td, verticalAlign: "middle", borderBottom: i === doneShown.length - 1 ? "none" : td.borderBottom };
                      return (
                        <tr key={o.id}>
                          <td style={{ ...cell, fontWeight: 600 }}>{o.group?.name ?? "—"}</td>
                          <td style={{ ...cell, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{o.orderDate}</td>
                          <td style={{ ...cell, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{o.deliveryDate ?? "—"}</td>
                          <td style={{ ...cell, textAlign: "center" }}>{unitsOf(o.lines)}</td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(o.deliveredAt, locale)}</td>
                          <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap", color: o.receivedAt ? "var(--green-dark)" : "var(--ink-soft)" }}>{o.receivedAt ? `✓ ${when(o.receivedAt, locale)}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={curDonePage} pages={donePages} onPage={setDonePage} />
            </>
          )}
        </PanelCard>
      )}
      </>
      )}
      </div>
    </PanelShell>
  );
}

function OrderCard({ order: o, busy, onAct, locale }: { order: Order; busy: boolean; onAct: (b: Record<string, unknown>) => void; locale: string }) {
  const { tr } = useI18n();
  const editable = ACTIVE.includes(o.status);
  return (
    <PanelCard
      title={`${o.group?.name ?? "—"} · ${o.orderDate}${o.deliveryDate ? ` → ${tr("Delivery")}: ${o.deliveryDate}` : ""}`}
      subtitle={`${unitsOf(o.lines)} ${tr("units")} · ${tr("sent")} ${when(o.approvedAt, locale)}`}
      action={
        <>
          <Pill status={o.status} />
          {o.status === "PREPARED" && <button style={S.smallDark} disabled={busy} onClick={() => onAct({ action: "dispatch" })}>{tr("Mark dispatched")}</button>}
          {o.status === "DISPATCHED" && <button style={S.smallDark} disabled={busy} onClick={() => onAct({ action: "deliver" })}>{tr("Mark delivered")}</button>}
        </>
      }
    >
      <div style={{ marginBottom: 10 }}><Flow status={o.status} /></div>
      {o.note && <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>💬 {o.note}</p>}
      {o.lines.slice().sort((a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? "")).map((l) => (
        <LineRow key={l.id} line={l} editable={editable} busy={busy} onAct={(b) => onAct({ action: "line", lineId: l.id, ...b })} />
      ))}
    </PanelCard>
  );
}

function LineRow({ line: l, editable, busy, onAct }: { line: Line; editable: boolean; busy: boolean; onAct: (b: Record<string, unknown>) => void }) {
  const { tr, lang } = useI18n();
  const [qty, setQty] = useState(String(l.quantity));
  const [note, setNote] = useState("");
  const [sub, setSub] = useState("");
  const [open, setOpen] = useState(false); // the "partial / unavailable" form
  const alts = l.product?.alternatives ?? [];
  const bg = l.status === "PREPARED" ? "var(--green-bg)" : l.status === "UNAVAILABLE" ? "var(--red-bg)" : "transparent";
  return (
    <div style={{ padding: "9px 10px", borderRadius: 8, background: bg, marginBottom: 4, border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, fontSize: 13 }}>
          <ProductThumb p={l.product} size={32} /> <strong>{l.quantity} × {l.product ? productName(l.product, lang) : ""}</strong>{l.alternativeName && <span> → {l.alternativeName}</span>}
          <span style={{ color: "var(--ink-soft)" }}> {l.product?.unit}{l.product?.brand ? ` · ${l.product.brand}` : ""}</span>
          {l.status === "PREPARED" && <div style={{ fontSize: 11.5 }}>✓ {tr("prepared")}: {l.preparedQty}{l.substituteName ? ` → ${l.substituteName}` : ""}{l.missingNote ? ` — ${l.missingNote}` : ""}</div>}
          {l.status === "UNAVAILABLE" && <div style={{ fontSize: 11.5, color: "var(--red)" }}>✗ {tr("not available")}{l.missingNote ? `: ${l.missingNote}` : ""}</div>}
        </div>
        {editable && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {l.status !== "PREPARED" && <button style={S.smallDark} disabled={busy} onClick={() => onAct({ status: "PREPARED", preparedQty: l.quantity })}>✓ {tr("Prepared")}</button>}
            <button style={S.small} disabled={busy} onClick={() => setOpen((v) => !v)}>{tr("Partial / missing")}</button>
            {l.status !== "PENDING" && <button style={S.small} disabled={busy} onClick={() => onAct({ status: "PENDING" })}>{tr("Undo")}</button>}
          </div>
        )}
      </div>
      {editable && open && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 11.5 }}>{tr("Quantity prepared")}</label>
            <input style={{ ...S.input, width: 80 }} type="number" min={1} max={l.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
            {alts.length > 0 && (
              <select style={{ ...S.input, width: "auto" }} value={sub} onChange={(e) => setSub(e.target.value)}>
                <option value="">{tr("Same product")}</option>
                {alts.map((a) => <option key={a.id} value={altLabel(a)}>{altLabel(a)}</option>)}
              </select>
            )}
          </div>
          <input style={S.input} placeholder={tr("Note (what is missing and why)")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: "flex", gap: 6 }}>
            <button style={S.smallDark} disabled={busy || !(Number(qty) >= 1)} onClick={() => { onAct({ status: "PREPARED", preparedQty: Number(qty), missingNote: note, substituteName: sub || undefined }); setOpen(false); }}>{tr("Save as prepared")}</button>
            <button style={{ ...S.small, borderColor: "var(--red)", color: "var(--red)" }} disabled={busy} onClick={() => { onAct({ status: "UNAVAILABLE", missingNote: note }); setOpen(false); }}>{tr("Mark unavailable")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
