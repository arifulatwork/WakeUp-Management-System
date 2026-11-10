"use client";

import { useEffect, useState } from "react";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCan } from "@/lib/useSession";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { S } from "@/components/ui";
import { dateKey, productName } from "@/lib/ordering";
import { Flow, Info, Order, OrderingBanner, Pill, Product, Req, td, th, unitsOf, useJson, when } from "@/components/ordering/common";
import { Group, GroupCard, GroupEditor, OrderBuilder } from "@/components/ordering/GroupPanels";

const SECTIONS = ["requests", "orders", "groups"] as const;
const LABELS: Record<(typeof SECTIONS)[number], string> = { requests: "Student requests", orders: "Orders", groups: "Groups & codes" };

// GROUPS & ORDERS — coordinators work with their own groups; managers can read everything; admins manage groups too.
export default function GroupOrdersPage() {
  const { tr, ev, locale, lang } = useI18n();
  const canReview = useCan("requests.review");
  const canCode = useCan("groups.code");
  const canManage = useCan("groups.manage");
  const canCreate = useCan("orders.create");
  const vis = useSectionVisibility("groupOrderSections", SECTIONS);

  const info = useJson<Info | null>("/api/ordering", null);
  const groups = useJson<Group[]>("/api/groups", []);
  const requests = useJson<Req[]>("/api/requests", []);
  const orders = useJson<Order[]>("/api/orders", []);
  const products = useJson<Product[]>("/api/products", []);
  const dietary = useJson<{ id: string; name: string }[]>("/api/dietary", []);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);
  const [groupEd, setGroupEd] = useState<{ group: Group | null } | null>(null);
  const [builder, setBuilder] = useState<{ group: Group; order: Order | null } | null>(null);
  const [err, setErr] = useState("");

  const refresh = () => { info.reload(); groups.reload(); requests.reload(); orders.reload(); products.reload(); dietary.reload(); };
  useLiveRefresh(refresh, { models: ["group", "worker", "studentRequest", "requestLine", "order", "orderLine", "product", "dietaryRequirement", "appSetting"] });
  useEffect(() => {
    if (!canManage) return;
    fetch("/api/workers").then((r) => (r.ok ? r.json() : [])).then((w) => setPeople(w.filter((x: any) => ["coordinator", "admin"].includes(x.role)))).catch(() => {});
    fetch("/api/houses").then((r) => (r.ok ? r.json() : [])).then(setHouses).catch(() => {});
  }, [canManage]);

  const today = dateKey();
  const cfg = info.data?.config;
  const orderingNow = !!info.data?.window.open;
  // Coordinators order themselves only in the "coordinator orders" model; admins may always.
  const mayBuild = canCreate && (cfg?.model === "COORDINATOR_ORDERS" || canManage) && (orderingNow || canManage);
  const pending = requests.data.filter((r) => r.status === "PENDING");
  const decided = requests.data.filter((r) => r.status !== "PENDING").slice(0, 8);
  const sortedOrders = orders.data.slice().sort((a, b) => b.orderDate.localeCompare(a.orderDate) || (a.group?.name ?? "").localeCompare(b.group?.name ?? ""));

  async function orderAction(o: Order, action: string) {
    setErr("");
    try { await api(`/api/orders/${o.id}`, "PATCH", { action }); }
    catch (e: any) {
      setErr(e?.message === "requests waiting" ? tr("Some student requests for this group are still waiting. Approve or reject them first.")
        : e?.message === "the order is empty" ? tr("The order is empty.")
        : e?.status === 409 ? tr("The supplier already started this order.") : saveError(e, tr));
    }
    orders.reload();
  }

  return (
    <PanelShell
      title={tr("Groups & Orders")}
      subtitle={tr("Student groups, their requests and orders — from request to delivery.")}
      vis={vis} labels={LABELS}
      actions={canManage ? <button style={S.navDark} onClick={() => setGroupEd({ group: null })}>+ {tr("Add group")}</button> : undefined}
    >
      <OrderingBanner info={info.data} />
      <StatGrid>
        <StatCard n={groups.data.length} label={tr("Groups")} />
        <StatCard n={pending.length} label={tr("Requests to review")} color="#B8860B" />
        <StatCard n={orders.data.filter((o) => ["APPROVED", "PREPARING", "PREPARED"].includes(o.status)).length} label={tr("With the supplier")} color="#2E6B8A" />
        <StatCard n={orders.data.filter((o) => o.status === "DISPATCHED").length} label={tr("On the way")} color="#4F7A26" />
      </StatGrid>
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      {vis.shown.requests && (
        <PanelCard title={`${tr("Student requests")} (${pending.length})`} subtitle={cfg?.model === "COORDINATOR_ORDERS" ? tr("Students do not send requests in the current ordering model.") : undefined}>
          {!pending.length && <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>{tr("No requests waiting.")}</p>}
          {pending.map((r) => <RequestCard key={r.id} req={r} canReview={canReview} onDone={refresh} />)}
          {decided.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>{tr("Recently decided")}</div>
              {decided.map((r) => (
                <div key={r.id} style={{ fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid var(--line)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Pill status={r.status} /> <strong>{r.student?.name}</strong> · {r.group?.name} · {r.lines.length} {tr("products")} · {when(r.createdAt, locale)}
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      )}

      {vis.shown.orders && (
        <PanelCard title={tr("Orders")} subtitle={tr("Follow each group's order until it is delivered.")} flush>
          {!sortedOrders.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No orders yet.")}</p>}
          {sortedOrders.map((o) => (
            <div key={o.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <div><strong>{o.group?.name}</strong> <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>· {o.orderDate} · {unitsOf(o.lines)} {tr("units")}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {canCreate && o.status === "OPEN" && (
                    <>
                      {mayBuild && <button style={S.small} onClick={() => { const g = groups.data.find((x) => x.id === o.groupId); if (g) setBuilder({ group: g, order: o }); }}>{tr("Edit order")}</button>}
                      <button style={S.smallDark} onClick={() => orderAction(o, "submit")}>{tr("Send to supplier")}</button>
                    </>
                  )}
                  {canCreate && ["OPEN", "APPROVED"].includes(o.status) && <button style={S.small} onClick={() => orderAction(o, "cancel")}>{tr("Cancel order")}</button>}
                </div>
              </div>
              <Flow status={o.status} />
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 }}>
                <thead><tr><th style={th}>{tr("Product")}</th><th style={th}>{tr("Ordered")}</th><th style={th}>{tr("Preparation")}</th></tr></thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id}>
                      <td style={td}>{l.product ? productName(l.product, lang) : ""}{l.alternativeName ? ` → ${l.alternativeName}` : ""}</td>
                      <td style={td}>{l.quantity} {l.product?.unit}</td>
                      <td style={td}>
                        {l.status === "PREPARED" ? `✓ ${l.preparedQty}${l.substituteName ? ` → ${l.substituteName}` : ""}${l.missingNote ? ` (${l.missingNote})` : ""}`
                          : l.status === "UNAVAILABLE" ? <span style={{ color: "var(--red)" }}>✗ {tr("not available")}{l.missingNote ? `: ${l.missingNote}` : ""}</span> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(o.dispatchedAt || o.deliveredAt) && <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "6px 0 0" }}>{o.dispatchedAt && `${tr("Dispatched")}: ${when(o.dispatchedAt, locale)}`} {o.deliveredAt && `· ${tr("Delivered")}: ${when(o.deliveredAt, locale)}`}</p>}
            </div>
          ))}
        </PanelCard>
      )}

      {vis.shown.groups && (
        <>
          {!groups.data.length && <PanelCard><p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No groups yet.")}</p></PanelCard>}
          {groups.data.map((g) => (
            <GroupCard key={g.id} group={g} dietary={dietary.data.map((d) => d.name)} canCode={canCode} canManage={canManage}
              onChanged={refresh} onEdit={() => setGroupEd({ group: g })}
              onOrder={mayBuild && !orders.data.some((o) => o.groupId === g.id && o.orderDate === today && o.status !== "CANCELLED") ? () => setBuilder({ group: g, order: null }) : undefined} />
          ))}
        </>
      )}

      {groupEd && <GroupEditor group={groupEd.group} coordinators={people} houses={houses} onClose={() => setGroupEd(null)} onSaved={() => { setGroupEd(null); refresh(); }} />}
      {builder && <OrderBuilder group={builder.group} order={builder.order} products={products.data} onClose={() => setBuilder(null)} onSaved={() => { setBuilder(null); refresh(); }} />}
    </PanelShell>
  );
}

// A waiting student request: approve as is, change a quantity, drop a line, or reject it with a note.
function RequestCard({ req, canReview, onDone }: { req: Req; canReview: boolean; onDone: () => void }) {
  const { tr, lang } = useI18n();
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(req.lines.map((l) => [l.id, l.quantity])));
  const [drop, setDrop] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const kept = req.lines.filter((l) => !drop[l.id]).length;

  async function decide(action: "approve" | "reject") {
    setBusy(true); setErr("");
    try {
      await api(`/api/requests/${req.id}`, "PATCH", {
        action, note,
        lines: req.lines.map((l) => ({ id: l.id, decision: drop[l.id] ? "REJECT" : "APPROVE", approvedQty: qty[l.id] })),
      });
      onDone();
    } catch (e: any) {
      setErr(e?.message === "the order was already sent to the supplier" ? tr("The order was already sent to the supplier, so this request can no longer be added. Reject it.") : saveError(e, tr));
      setBusy(false);
    }
  }
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <div>
          <strong>{req.student?.name}</strong> <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>· {req.group?.name}</span>
          {!!req.student?.dietary.length && <div style={{ fontSize: 11.5, marginTop: 2 }}>🥗 {req.student.dietary.join(", ")}</div>}
        </div>
        <Pill status={req.status} />
      </div>
      {req.lines.map((l) => {
        const exception = l.standardQty != null && l.quantity !== l.standardQty;
        return (
          <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line)", opacity: drop[l.id] ? 0.45 : 1 }}>
            <div style={{ flex: "1 1 200px", fontSize: 13 }}>
              {l.product ? productName(l.product, lang) : ""}{l.alternativeName ? ` → ${l.alternativeName}` : ""}
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {tr("Standard")}: {l.standardQty} · {tr("asked")}: {l.quantity}
                {exception && <> · <strong style={{ color: "#B8860B" }}>{tr("exception")}</strong>: {l.exceptionReason}</>}
              </div>
              {l.dietaryFlag && <div style={{ fontSize: 11.5, color: "var(--red)" }}>⚠ {tr("Not suitable for: {list}", { list: l.dietaryFlag })}</div>}
            </div>
            {canReview && (
              <>
                <input style={{ ...S.input, width: 70 }} type="number" min={1} max={99} value={qty[l.id]} disabled={!!drop[l.id]}
                  onChange={(e) => setQty({ ...qty, [l.id]: Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))) })} />
                <button style={S.small} onClick={() => setDrop({ ...drop, [l.id]: !drop[l.id] })}>{drop[l.id] ? tr("Keep") : tr("Reject line")}</button>
              </>
            )}
          </div>
        );
      })}
      {canReview && (
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <input style={S.input} placeholder={tr("Note for the student (optional)")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p style={{ color: "var(--red)", fontSize: 12.5, margin: 0 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.danger, flex: 1 }} disabled={busy} onClick={() => decide("reject")}>{tr("Reject request")}</button>
            <button style={{ ...S.primary, opacity: kept && !busy ? 1 : 0.5 }} disabled={busy || !kept} onClick={() => decide("approve")}>{tr("Approve")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
