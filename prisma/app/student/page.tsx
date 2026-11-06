"use client";

import { useEffect, useMemo, useState } from "react";
import PanelShell, { PanelCard } from "@/components/PanelShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { S } from "@/components/ui";
import { dietaryGaps } from "@/lib/ordering";
import { altLabel, Flow, Info, Order, OrderingBanner, Pill, Product, Req, Stepper, useJson, when } from "@/components/ordering/common";

type Me = { name: string; groupName?: string; dietary?: string[] };
type Pick = { qty: number; reason: string; alt: string };

// STUDENT SCREEN — joined with the group code. Sees the catalogue and the standard quantities, sends a request
// (with a reason when the quantity differs from the standard one), follows their requests and the group's order.
export default function StudentPage() {
  const { tr, ev, locale } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const info = useJson<Info | null>("/api/ordering", null);
  const products = useJson<Product[]>("/api/products", []);
  const requests = useJson<Req[]>("/api/requests", []);
  const orders = useJson<Order[]>("/api/orders", []);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadMe = () => fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  useEffect(() => { loadMe(); }, []);
  const refresh = () => { loadMe(); info.reload(); products.reload(); requests.reload(); orders.reload(); };
  useLiveRefresh(refresh, { models: ["product", "studentRequest", "requestLine", "order", "orderLine", "worker", "appSetting", "group"] });

  const cfg = info.data?.config;
  const canOrder = !!cfg && cfg.model === "STUDENT_REQUESTS" && !!info.data?.window.open;
  const dietary = me?.dietary ?? [];
  const pending = requests.data.find((r) => r.status === "PENDING");
  const groups = useMemo(() => {
    const m = new Map<string, Product[]>();
    products.data.forEach((p) => m.set(p.category, [...(m.get(p.category) ?? []), p]));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products.data]);

  const set = (id: string, patch: Partial<Pick>) => setPicks((cur) => ({ ...cur, [id]: { qty: 0, reason: "", alt: "", ...cur[id], ...patch } }));
  const chosen = Object.entries(picks).filter(([, p]) => p.qty > 0);
  const missingReason = chosen.some(([id, p]) => {
    const prod = products.data.find((x) => x.id === id);
    return prod && p.qty !== prod.standardQty && p.reason.trim().length < 3;
  });

  async function send() {
    setSending(true); setMsg(null);
    try {
      await api("/api/requests", "POST", { lines: chosen.map(([productId, p]) => ({ productId, quantity: p.qty, reason: p.reason, alternativeId: p.alt || undefined })) });
      setPicks({});
      setMsg({ ok: true, text: tr("Request sent. Your coordinator will review it.") });
      refresh();
    } catch (e: any) {
      const t = e?.message === "ordering closed" ? tr("Ordering is closed right now.")
        : e?.message === "you already have a request waiting for approval" ? tr("You already have a request waiting for approval.")
        : e?.message === "reason required" ? tr("Please give a reason for every quantity that is not the standard one.")
        : tr("Could not send the request. Please try again.");
      setMsg({ ok: false, text: t });
      refresh();
    }
    setSending(false);
  }

  async function cancel(id: string) {
    try { await api(`/api/requests/${id}`, "PATCH", { action: "cancel" }); } catch { /* shown by refresh */ }
    refresh();
  }

  const myOrders = orders.data.slice().sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return (
    <PanelShell title={tr("My Orders")} subtitle={me ? `${me.name}${me.groupName ? " · " + me.groupName : ""}` : undefined}>
      <OrderingBanner info={info.data} />

      <PanelCard title={tr("My dietary requirements")}>
        {dietary.length
          ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{dietary.map((d) => <span key={d} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--green-bg)" }}>{d}</span>)}</div>
          : <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>{tr("None registered. If you have one, tell your coordinator.")}</p>}
      </PanelCard>

      <PanelCard title={tr("Products")} subtitle={cfg?.model === "STUDENT_REQUESTS" ? tr("Standard quantity is per person. Ask for a different quantity only with a reason.") : tr("Standard quantities per person.")}>
        {msg && <p style={{ fontSize: 12.5, color: msg.ok ? "var(--green-dark)" : "var(--red)", marginTop: 0 }}>{msg.text}</p>}
        {pending && <p style={{ fontSize: 12.5, marginTop: 0 }}>⏳ {tr("You already have a request waiting for approval.")}</p>}
        {!products.data.length && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{tr("No products yet.")}</p>}
        {groups.map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>{cat}</div>
            {list.map((p) => {
              const pick = picks[p.id] ?? { qty: 0, reason: "", alt: "" };
              const alt = p.alternatives.find((a) => a.id === pick.alt);
              const gaps = dietaryGaps(dietary, alt ? alt.dietaryTags : p.dietaryTags);
              const suitable = p.alternatives.filter((a) => dietaryGaps(dietary, a.dietaryTags).length === 0);
              const exception = pick.qty > 0 && pick.qty !== p.standardQty;
              return (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}{p.brand && <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}> · {p.brand}</span>}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{tr("Standard")}: {p.standardQty} {p.unit}</div>
                    </div>
                    {canOrder && !pending && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {cfg?.allowExceptions ? (
                          <>
                            {pick.qty === 0 && <button style={S.small} onClick={() => set(p.id, { qty: p.standardQty })}>{tr("Standard")} ({p.standardQty})</button>}
                            <Stepper value={pick.qty} onChange={(n) => set(p.id, { qty: n })} />
                          </>
                        ) : (
                          // quantity exceptions are switched off: take the standard quantity or nothing
                          <button style={pick.qty ? S.smallDark : S.small} onClick={() => set(p.id, { qty: pick.qty ? 0 : p.standardQty })}>
                            {pick.qty ? `✓ ${p.standardQty} ${p.unit}` : `${tr("Add")} (${p.standardQty})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {gaps.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 4 }}>
                      ⚠ {tr("Not suitable for: {list}", { list: gaps.join(", ") })}
                      {suitable.length > 0 && <> — {tr("Try")}: {suitable.map(altLabel).join(" / ")}</>}
                    </div>
                  )}
                  {canOrder && !pending && pick.qty > 0 && p.alternatives.length > 0 && (
                    <select style={{ ...S.input, marginTop: 6 }} value={pick.alt} onChange={(e) => set(p.id, { alt: e.target.value })}>
                      <option value="">{tr("Standard product")}</option>
                      {p.alternatives.map((a) => <option key={a.id} value={a.id}>{altLabel(a)}{dietaryGaps(dietary, a.dietaryTags).length === 0 && dietary.length ? " ✓" : ""}</option>)}
                    </select>
                  )}
                  {exception && (
                    cfg?.allowExceptions
                      ? <input style={{ ...S.input, marginTop: 6 }} placeholder={tr("Reason for a different quantity")} value={pick.reason} maxLength={200} onChange={(e) => set(p.id, { reason: e.target.value })} />
                      : <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 4 }}>{tr("Only the standard quantity can be requested.")}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {canOrder && !pending && (
          <button style={{ ...S.primary, width: "100%", flex: "none", opacity: chosen.length && !missingReason && !sending && (cfg?.allowExceptions || chosen.every(([id, p]) => p.qty === products.data.find((x) => x.id === id)?.standardQty)) ? 1 : 0.5 }}
            disabled={!chosen.length || missingReason || sending || (!cfg?.allowExceptions && !chosen.every(([id, p]) => p.qty === products.data.find((x) => x.id === id)?.standardQty))} onClick={send}>
            {sending ? tr("Sending…") : `${tr("Send request")} (${chosen.length})`}
          </button>
        )}
      </PanelCard>

      <PanelCard title={tr("My requests")}>
        {!requests.data.length && <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>{tr("No requests yet.")}</p>}
        {requests.data.slice(0, 15).map((r) => (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{when(r.createdAt, locale)}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill status={r.status} />
                {r.status === "PENDING" && <button style={S.small} onClick={() => cancel(r.id)}>{tr("Cancel")}</button>}
              </span>
            </div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
              {r.lines.map((l) => (
                <li key={l.id}>
                  {l.product?.name}{l.alternativeName ? ` → ${l.alternativeName}` : ""} × {l.quantity}
                  {l.standardQty != null && l.quantity !== l.standardQty && <em style={{ color: "var(--ink-soft)" }}> ({tr("standard")} {l.standardQty}: {l.exceptionReason})</em>}
                  {r.status === "APPROVED" && l.lineStatus === "REJECTED" && <strong style={{ color: "var(--red)" }}> — {ev("REJECTED")}</strong>}
                  {r.status === "APPROVED" && l.lineStatus === "APPROVED" && l.approvedQty != null && l.approvedQty !== l.quantity && <strong> — {tr("approved")}: {l.approvedQty}</strong>}
                </li>
              ))}
            </ul>
            {r.decisionNote && <p style={{ fontSize: 12, margin: "6px 0 0", color: "var(--ink-soft)" }}>💬 {r.decisionNote}</p>}
          </div>
        ))}
      </PanelCard>

      <PanelCard title={tr("Group order status")} subtitle={me?.groupName}>
        {!myOrders.length && <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>{tr("No orders yet.")}</p>}
        {myOrders.slice(0, 6).map((o) => (
          <div key={o.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>{o.orderDate}</div>
            <Flow status={o.status} />
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
              {o.lines.map((l) => (
                <li key={l.id}>
                  {l.product?.name}{l.alternativeName ? ` → ${l.alternativeName}` : ""} × {l.quantity}
                  {l.status === "UNAVAILABLE" && <strong style={{ color: "var(--red)" }}> — {tr("not available")}{l.missingNote ? `: ${l.missingNote}` : ""}</strong>}
                  {l.substituteName && <span style={{ color: "var(--ink-soft)" }}> → {l.substituteName}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </PanelCard>
    </PanelShell>
  );
}
