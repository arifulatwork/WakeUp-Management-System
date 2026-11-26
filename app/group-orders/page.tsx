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
import { dateKey, productName } from "@/lib/ordering";
import { Flow, Info, Order, OrderingBanner, Pill, Product, Req, td, th, unitsOf, useJson, when } from "@/components/ordering/common";
import { Pager, norm } from "@/components/ordering/Pager";
import { Group, GroupCard } from "@/components/ordering/GroupPanels";

// The two pop-ups are only downloaded when somebody opens one.
const GroupEditor = dynamic(() => import("@/components/ordering/GroupPanels").then((m) => m.GroupEditor), { ssr: false });
const OrderBuilder = dynamic(() => import("@/components/ordering/GroupPanels").then((m) => m.OrderBuilder), { ssr: false });

// One tab per section. Only the open tab loads its data, one list after the other (NEEDS), so the
// screen no longer asks the server for everything at the same moment. The open tab is kept in the
// address (#orders).
const TABS = ["requests", "orders", "groups"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { requests: "Student requests", orders: "Orders", groups: "Groups & codes" };
type Res = "info" | "requests" | "orders" | "groups" | "dietary" | "products" | "people" | "houses";
const NEEDS: Record<Tab, Res[]> = {
  requests: ["info", "requests"],
  orders: ["info", "orders", "groups"],          // groups: only for "Edit order"
  groups: ["info", "groups", "orders", "dietary"], // orders: to know which groups already ordered today
};

// Paging and filtering of the long lists.
const ORDERS_PER_PAGE = 10;
const GROUPS_PER_PAGE = 8;
const STATUS_FILTERS = ["ACTIVE", "OPEN", "WITH_SUPPLIER", "DISPATCHED", "DELIVERED", "CANCELLED", "ALL"];
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", OPEN: "Open", WITH_SUPPLIER: "With the supplier", DISPATCHED: "On the way",
  DELIVERED: "Delivered", CANCELLED: "Cancelled", ALL: "All",
};

export default function GroupOrdersPage() {
  const { tr, ev, locale, lang } = useI18n();
  const canReview = useCan("requests.review");
  const canCode = useCan("groups.code");
  const canManage = useCan("groups.manage");
  const canCreate = useCan("orders.create");
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "requests");

  // Products (order builder) and people / houses (group editor) are only needed by the pop-ups: they load when one opens.
  const [wantProducts, setWantProducts] = useState(false);
  const [wantPeople, setWantPeople] = useState(false);
  const want: Res[] = [...NEEDS[tab]];
  if (wantProducts) want.push("products");
  if (wantPeople && canManage) want.push("people", "houses");
  const stages = useStages(want);
  const on = stages.on;

  const info = useJson<Info | null>(on("info") ? "/api/ordering" : null, null);
  const groups = useJson<Group[]>(on("groups") ? "/api/groups" : null, []);
  const requests = useJson<Req[]>(on("requests") ? "/api/requests" : null, []);
  const orders = useJson<Order[]>(on("orders") ? "/api/orders" : null, []);
  const products = useJson<Product[]>(on("products") ? "/api/products" : null, []);
  const dietary = useJson<{ id: string; name: string }[]>(on("dietary") ? "/api/dietary" : null, []);
  const peopleQ = useJson<{ id: string; name: string; role: string }[]>(on("people") ? "/api/workers" : null, []);
  const housesQ = useJson<{ id: string; name: string }[]>(on("houses") ? "/api/houses" : null, []);
  useStagesAdvance(stages, {
    info: info.loaded, requests: requests.loaded, orders: orders.loaded, groups: groups.loaded,
    dietary: dietary.loaded, products: products.loaded, people: peopleQ.loaded, houses: housesQ.loaded,
  });
  const people = peopleQ.data.filter((x) => ["coordinator", "admin"].includes(x.role));
  const houses = housesQ.data;
  const [groupEd, setGroupEd] = useState<{ group: Group | null } | null>(null);
  const [builder, setBuilder] = useState<{ group: Group; order: Order | null } | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("ACTIVE"); // finished orders stay out of the way until asked for
  const [orderPage, setOrderPage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);
  const [showArchive, setShowArchive] = useState(false); // false = current groups, true = archive (end date passed)
  useEffect(() => { setOrderPage(1); setGroupPage(1); }, [q, statusF, showArchive]);

  const refresh = () => { info.reload(); groups.reload(); requests.reload(); orders.reload(); products.reload(); dietary.reload(); };
  useLiveRefresh(refresh, { models: ["group", "worker", "studentRequest", "requestLine", "order", "orderLine", "product", "dietaryRequirement", "appSetting"] });
  // Opening a pop-up starts loading what it needs.
  const openBuilder = (b: { group: Group; order: Order | null }) => { setWantProducts(true); setBuilder(b); };
  const openGroupEditor = (g: Group | null) => { setWantPeople(true); setGroupEd({ group: g }); };

  const today = dateKey();
  const cfg = info.data?.config;
  const orderingNow = !!info.data?.window.open;
  // Coordinators order themselves only in the "coordinator orders" model; admins may always.
  const mayBuild = canCreate && (cfg?.model === "COORDINATOR_ORDERS" || canManage) && (orderingNow || canManage);
  const pending = requests.data.filter((r) => r.status === "PENDING");
  const sortedOrders = orders.data.slice().sort((a, b) => b.orderDate.localeCompare(a.orderDate) || (a.group?.name ?? "").localeCompare(b.group?.name ?? ""));

  // ---- search + filter + paging ----
  const needle = norm(q.trim());
  const searching = needle.length > 0;
  const hit = (...parts: unknown[]) => !searching || parts.some((p) => norm(p).includes(needle));
  const statusMatch = (o: Order, f: string) =>
    f === "ALL" ? true
    : f === "ACTIVE" ? o.status !== "CANCELLED" && o.status !== "DELIVERED" // delivered = done (the driver's "Delivered" is the confirmation)
    : f === "WITH_SUPPLIER" ? ["APPROVED", "PREPARING", "PREPARED"].includes(o.status)
    : o.status === f;

  const pendingShown = pending.filter((r) => hit(r.student?.name, r.group?.name));
  const decidedShown = requests.data.filter((r) => r.status !== "PENDING" && hit(r.student?.name, r.group?.name)).slice(0, 8);
  const ordersMatching = sortedOrders.filter((o) => statusMatch(o, statusF) && hit(o.group?.name, o.orderDate, o.deliveryDate, ...o.lines.map((l) => (l.product ? productName(l.product, lang) : ""))));
  const orderPages = Math.max(1, Math.ceil(ordersMatching.length / ORDERS_PER_PAGE));
  const curOrderPage = Math.min(orderPage, orderPages);
  const pagedOrders = ordersMatching.slice((curOrderPage - 1) * ORDERS_PER_PAGE, curOrderPage * ORDERS_PER_PAGE);
  const currentGroups = groups.data.filter((g) => !g.archived);
  const archivedGroups = groups.data.filter((g) => g.archived);
  const groupsMatching = (showArchive ? archivedGroups : currentGroups).filter((g) => hit(g.name, g.house?.name, g.coordinator?.name));
  const groupPages = Math.max(1, Math.ceil(groupsMatching.length / GROUPS_PER_PAGE));
  const curGroupPage = Math.min(groupPage, groupPages);
  const pagedGroups = groupsMatching.slice((curGroupPage - 1) * GROUPS_PER_PAGE, curGroupPage * GROUPS_PER_PAGE);
  const statusCount = (f: string) => sortedOrders.filter((o) => statusMatch(o, f)).length;

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

  // A list that has not arrived (or could not be loaded) shows grey rows / a retry button instead of "nothing here".
  type L = { loaded: boolean; error: boolean; data: unknown; reload: () => void };
  const blocked = (q: L) => !q.loaded || (q.error && (Array.isArray(q.data) ? q.data.length === 0 : !q.data));
  const waiting = (q: L, rows = 4) => (q.loaded ? <LoadError onRetry={q.reload} /> : <SkeletonRows rows={rows} />);
  const n = (q: L, v: number) => (q.loaded ? v : "…");

  return (
    <PanelShell
      title={tr("Groups & Orders")}
      subtitle={tr("Student groups, their requests and orders — from request to delivery.")}
      actions={canManage ? <button style={S.navDark} onClick={() => openGroupEditor(null)}>+ {tr("Add group")}</button> : undefined}
    >
      <PanelTabs
        tabs={TABS.map((t) => ({ id: t, label: tr(TAB_LABEL[t]), badge: t === "requests" && requests.loaded ? pending.length : undefined }))}
        value={tab}
        onChange={chooseTab}
        label={tr("Groups & Orders")}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      <OrderingBanner info={info.data} />
      <StatGrid>
        {tab === "requests" && <StatCard n={n(requests, pending.length)} label={tr("Requests to review")} color="#B8860B" />}
        {tab === "orders" && <StatCard n={n(orders, orders.data.filter((o) => ["APPROVED", "PREPARING", "PREPARED"].includes(o.status)).length)} label={tr("With the supplier")} color="#2E6B8A" />}
        {tab === "orders" && <StatCard n={n(orders, orders.data.filter((o) => o.status === "DISPATCHED").length)} label={tr("On the way")} color="#4F7A26" />}
        {tab === "groups" && <StatCard n={n(groups, currentGroups.length)} label={tr("Groups")} />}
      </StatGrid>
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60}
          placeholder={tr("Search groups, students or orders…")} aria-label={tr("Search groups, students or orders…")}
          style={{ ...S.input, maxWidth: 420 }}
        />
        {searching && <button type="button" style={S.small} onClick={() => setQ("")}>{tr("Clear")}</button>}
      </div>

      {tab === "requests" && (
        <PanelCard title={`${tr("Student requests")} (${pending.length})`} subtitle={cfg?.model === "COORDINATOR_ORDERS" ? tr("Students do not send requests in the current ordering model.") : undefined}>
          {blocked(requests) ? waiting(requests) : (
          <>
          {!pendingShown.length && (
            <div style={{ padding: "18px 14px", textAlign: "center", fontSize: 13, color: "var(--ink-soft)", background: "#F7F8F4", border: "1px dashed var(--line)", borderRadius: 10 }}>
              {pending.length ? tr("No matching requests.") : tr("No requests waiting.")}
            </div>
          )}
          {pendingShown.map((r) => <RequestCard key={r.id} req={r} canReview={canReview} onDone={refresh} />)}
          {decidedShown.length > 0 && (
            <div style={{ marginTop: pendingShown.length ? 22 : 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8 }}>{tr("Recently decided")}</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F7F8F4" }}>
                      <th style={th}>{tr("Student")}</th>
                      <th style={th}>{tr("Group")}</th>
                      <th style={{ ...th, textAlign: "center" }}>{tr("Products")}</th>
                      <th style={th}>{tr("Date")}</th>
                      <th style={{ ...th, textAlign: "right" }}>{tr("Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedShown.map((r, i) => {
                      const last = i === decidedShown.length - 1;
                      const cell: React.CSSProperties = { ...td, verticalAlign: "middle", borderBottom: last ? "none" : td.borderBottom };
                      return (
                        <tr key={r.id}>
                          <td style={{ ...cell, fontWeight: 600 }}>{r.student?.name}</td>
                          <td style={{ ...cell, color: "var(--ink-soft)" }}>{r.group?.name}</td>
                          <td style={{ ...cell, textAlign: "center" }}>{r.lines.length}</td>
                          <td style={{ ...cell, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{when(r.createdAt, locale)}</td>
                          <td style={{ ...cell, textAlign: "right" }}><Pill status={r.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}
        </PanelCard>
      )}

      {tab === "orders" && (
        <PanelCard title={tr("Orders")} subtitle={tr("Follow each group's order until it is delivered.")} flush>
          {blocked(orders) ? waiting(orders) : (
          <>
          {sortedOrders.length > 0 && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <Pills
                options={STATUS_FILTERS} value={statusF} onChange={setStatusF}
                label={(f) => `${tr(STATUS_LABEL[f])} (${statusCount(f)})`}
              />
            </div>
          )}
          {!sortedOrders.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No orders yet.")}</p>}
          {sortedOrders.length > 0 && !ordersMatching.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No matching orders.")}</p>}
          {pagedOrders.map((o) => (
            <div key={o.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <div><strong>{o.group?.name}</strong> <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>· {o.orderDate}{o.deliveryDate ? ` → ${tr("Delivery")}: ${o.deliveryDate}` : ""} · {unitsOf(o.lines)} {tr("units")}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {canCreate && o.status === "OPEN" && (
                    <>
                      {mayBuild && <button style={S.small} disabled={!groups.loaded} onClick={() => { const g = groups.data.find((x) => x.id === o.groupId); if (g) openBuilder({ group: g, order: o }); }}>{tr("Edit order")}</button>}
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
              {(o.dispatchedAt || o.deliveredAt) && <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "6px 0 0" }}>{o.dispatchedAt && `${tr("Dispatched")}: ${when(o.dispatchedAt, locale)}`} {o.deliveredAt && `· ${tr("Delivered")}: ${when(o.deliveredAt, locale)}`} {o.receivedAt && `· ✓ ${tr("Received")}: ${when(o.receivedAt, locale)}`}</p>}
            </div>
          ))}
          <Pager page={curOrderPage} pages={orderPages} onPage={setOrderPage} />
          </>
          )}
        </PanelCard>
      )}

      {tab === "groups" && (
        blocked(groups) ? <PanelCard flush>{waiting(groups)}</PanelCard> : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button style={showArchive ? S.small : S.smallDark} onClick={() => setShowArchive(false)}>{tr("Current")} ({currentGroups.length})</button>
            <button style={showArchive ? S.smallDark : S.small} onClick={() => setShowArchive(true)}>{tr("Archived groups")} ({archivedGroups.length})</button>
          </div>
          {!(showArchive ? archivedGroups : currentGroups).length && <PanelCard><p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{showArchive ? tr("No archived groups.") : tr("No groups yet.")}</p></PanelCard>}
          {(showArchive ? archivedGroups : currentGroups).length > 0 && !groupsMatching.length && <PanelCard><p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No matching groups.")}</p></PanelCard>}
          {pagedGroups.map((g) => (
            <GroupCard key={g.id} group={g} dietary={dietary.data.map((d) => d.name)} canCode={canCode} canManage={canManage}
              onChanged={refresh} onEdit={() => openGroupEditor(g)}
              onOrder={mayBuild && orders.loaded && !g.archived && !orders.data.some((o) => o.groupId === g.id && o.orderDate === today && o.status !== "CANCELLED") ? () => openBuilder({ group: g, order: null }) : undefined} />
          ))}
          <Pager page={curGroupPage} pages={groupPages} onPage={setGroupPage} />
        </>
        )
      )}
      </div>

      {groupEd && peopleQ.loaded && housesQ.loaded && <GroupEditor group={groupEd.group} coordinators={people} houses={houses} onClose={() => setGroupEd(null)} onSaved={() => { setGroupEd(null); refresh(); }} />}
      {builder && products.loaded && <OrderBuilder group={builder.group} order={builder.order} products={products.data} onClose={() => setBuilder(null)} onSaved={() => { setBuilder(null); refresh(); }} />}
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
                <input style={{ ...S.input, width: 70 }} type="number" min={1} max={9999} value={qty[l.id]} disabled={!!drop[l.id]}
                  onChange={(e) => setQty({ ...qty, [l.id]: Math.max(1, Math.min(9999, Math.floor(Number(e.target.value) || 1))) })} />
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
