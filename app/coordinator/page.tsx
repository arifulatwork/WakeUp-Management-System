"use client";

import dynamic from "next/dynamic";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
import { LoadError, SkeletonRows, useApiList } from "@/components/PanelKit";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useCan } from "@/lib/useSession";
import { S, StatusBadge, PriorityDot } from "@/components/ui";
import { PhotoStrip } from "@/components/Photos";
import { MEDIA_ENABLED } from "@/lib/features";
import { cmpText, sortTickets, taskWhen } from "@/lib/sort";
import { checkReadiness, REASON_TEXT } from "@/lib/readiness";
import type { EdTask, EdWorker } from "@/components/editors/TaskEditor";
import type { EdTicket } from "@/components/editors/TicketEditor";
import type { EdHouseFull } from "@/components/editors/HouseEditor";
import MaintenanceReview from "@/components/MaintenanceReview";

type Task = EdTask & { house: { id: string; name: string } };
type Ticket = EdTicket & { house: { id: string; name: string } };

// The editors and the review pop-up are only downloaded when somebody opens one.
const TaskEditor = dynamic(() => import("@/components/editors/TaskEditor"), { ssr: false });
const TicketEditor = dynamic(() => import("@/components/editors/TicketEditor"), { ssr: false });
const HouseEditor = dynamic(() => import("@/components/editors/HouseEditor"), { ssr: false });
const MaterialEditor = dynamic(() => import("@/components/editors/MaterialEditor"), { ssr: false });
const TaskReview = dynamic(() => import("@/components/TaskReview"), { ssr: false });

// Two tabs: the houses (opens first) and the maintenance work waiting for review.
const TABS = ["houses", "maintenance"] as const;
type Tab = (typeof TABS)[number];

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];

// Coordinators verify cleaning / maintenance / linens / keys and confirm a
// house is ready for check-in. Everything on this screen is editable:
// tasks (create, edit, reassign, delete), issues, houses, key status and
// material requests.
export default function CoordinatorView() {
  const { tr, ev } = useI18n();
  const canCreateHouse = useCan("houses.create");
  const canEditHouse = useCan("houses.edit");
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "houses");

  // Each list loads on its own and shows as soon as it arrives; a slow one no longer holds back the others.
  // The house cards appear first; their jobs and issues fill in when those lists arrive.
  // Workers are only needed by the task / issue pop-ups, so they load last (or when a pop-up is opened).
  const housesQ = useApiList<EdHouseFull[]>("/api/houses", ["house"]);
  const tasksQ = useApiList<Task[]>("/api/tasks", ["cleaningTask", "house", "worker"]);
  const ticketsQ = useApiList<Ticket[]>("/api/tickets?open=1", ["maintenanceTicket", "house", "worker"]);
  const settled = (q: { data: unknown; error: boolean }) => q.data !== null || q.error;
  const [wantLookups, setWantLookups] = useState(false);
  const workersQ = useApiList<EdWorker[]>(
    (settled(housesQ) && settled(tasksQ) && settled(ticketsQ)) || wantLookups ? "/api/workers" : null, ["worker"]);
  const houses = housesQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const workers = workersQ.data ?? [];
  const detailsReady = tasksQ.data !== null && ticketsQ.data !== null; // readiness needs both
  const lookupsReady = workersQ.data !== null;
  const [order, setOrder] = useState<"attention" | "name">("attention");

  // which editor is open
  const [taskEd, setTaskEd] = useState<{ task: Task | null; houseId?: string } | null>(null);
  const [ticketEd, setTicketEd] = useState<{ ticket: Ticket | null; houseId?: string } | null>(null);
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);
  const [matEd, setMatEd] = useState<{ houseId?: string } | null>(null);
  const [reviewing, setReviewing] = useState<Task | null>(null); // the job being reviewed before it is confirmed

  // After a change made here: reload what it touched. (Other people's changes arrive by themselves, live.)
  const load = () => { housesQ.reload(); tasksQ.reload(); ticketsQ.reload(); };
  // Opening a pop-up that needs the worker list starts loading it at once.
  useEffect(() => { if (taskEd || ticketEd || reviewing) setWantLookups(true); }, [taskEd, ticketEd, reviewing]);

  const done = () => {
    setTaskEd(null); setTicketEd(null); setHouseEd(null); setMatEd(null);
    load();
  };

  async function patchTask(id: string, action: string) {
    await api(`/api/tasks/${id}`, "PATCH", { action });
    load();
  }
  // Send a finished job back to the cleaner (asks first if it was already approved).
  async function sendBack(id: string, status: string) {
    if (status === "APPROVED" && !window.confirm(tr("Send this approved job back to the cleaner?"))) return;
    await patchTask(id, "reopen");
  }
  // Approved by mistake / changed your mind: back to "To be verified" (asks first).
  async function undoApproval(id: string) {
    if (!window.confirm(tr("Take back the approval? The job goes back to To be verified."))) return;
    await patchTask(id, "unapprove");
  }
  async function setKey(houseId: string, keyStatus: string) {
    housesQ.mutate((hs) => (hs ? hs.map((h) => (h.id === houseId ? { ...h, keyStatus } : h)) : hs)); // optimistic
    await api(`/api/houses/${houseId}`, "PATCH", { keyStatus });
    load();
  }
  const houseOpts = houses.map((h) => ({ id: h.id, name: h.mode === "TOURISM" ? `${h.name} · ${ev("TOURISM")}` : h.name }));

  // "Needs attention" puts the houses where the coordinator has to act on top:
  // 0 a job is waiting to be verified · 1 open problem · 2 key missing ·
  // 3 work still in progress · 4 nothing scheduled · 5 all done & ready.
  const attention = (h: EdHouseFull) => {
    const ts = tasks.filter((t) => t.house.id === h.id);
    const ks = tickets.filter((k) => k.house.id === h.id);
    if (ts.some((t) => t.status === "TO_BE_VERIFIED")) return 0;
    if (ks.length > 0 || ts.some((t) => t.status === "WITH_ISSUE")) return 1;
    if (h.keyStatus === "MISSING") return 2;
    if (ts.some((t) => !["APPROVED", "COMPLETED"].includes(t.status))) return 3;
    return ts.length === 0 ? 4 : 5;
  };
  const sortedHouses = [...houses].sort((a, b) =>
    order === "attention" && detailsReady ? attention(a) - attention(b) || cmpText(a.name, b.name) : cmpText(a.name, b.name)
  );

  // Summary tiles
  const isReady = (h: EdHouseFull) => {
    const ts = tasks.filter((t) => t.house.id === h.id);
    const hasIssue = tickets.some((k) => k.house.id === h.id) || ts.some((t) => t.status === "WITH_ISSUE");
    return ts.length > 0 && !hasIssue && ts.every((t) => ["APPROVED", "COMPLETED"].includes(t.status));
  };
  const readyCount = houses.filter(isReady).length;
  const toVerify = tasks.filter((t) => t.status === "TO_BE_VERIFIED").length;
  const keysMissing = houses.filter((h) => h.keyStatus === "MISSING").length;

  return (
    <PanelShell
      title={tr("Check-in Readiness")}
      subtitle={tr("Verify cleaning, maintenance, linens and keys before confirming a house is ready.")}
      actions={
        <>
          <button style={S.navDark} onClick={() => setTaskEd({ task: null })}>+ {tr("New task")}</button>
          <button style={S.nav} onClick={() => setTicketEd({ ticket: null })}>+ {tr("Report an Issue")}</button>
          <button style={S.nav} onClick={() => setMatEd({})}>+ {tr("New request")}</button>
          {canCreateHouse && <button style={S.nav} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button>}
        </>
      }
    >
      <PanelTabs
        tabs={[
          { id: "houses" as const, label: tr("Houses") },
          { id: "maintenance" as const, label: tr("Maintenance to review"), badge: tickets.filter((k) => k.status === "TO_BE_VERIFIED").length },
        ]}
        value={tab}
        onChange={chooseTab}
        label={tr("Check-in Readiness")}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === "maintenance" && (
        ticketsQ.data ? (
          <MaintenanceReview tickets={tickets} onChanged={load} />
        ) : (
          <PanelCard title={tr("Maintenance to review")} flush>
            {ticketsQ.error ? <LoadError onRetry={ticketsQ.reload} /> : <SkeletonRows rows={3} />}
          </PanelCard>
        )
      )}

      {tab === "houses" && (
      <>
      <StatGrid>
        <StatCard n={detailsReady ? readyCount : "…"} label={tr("Houses ready")} color="#4F7A26" />
        <StatCard n={detailsReady ? toVerify : "…"} label={tr("To be verified")} color="#D98A33" />
        <StatCard n={ticketsQ.data ? tickets.length : "…"} label={tr("Open issues")} color="#C1503C" />
        <StatCard n={housesQ.data ? keysMissing : "…"} label={tr("Keys missing")} color="#C1503C" />
      </StatGrid>

      <PanelCard
        title={tr("Houses")}
        action={
          <>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("Sort by")}:</span>
            {([["attention", "Needs attention"], ["name", "Name"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setOrder(k)} aria-pressed={order === k} style={{
                fontSize: 11.5, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--line)", cursor: "pointer",
                background: order === k ? "var(--ink)" : "#fff", color: order === k ? "#fff" : "var(--ink-soft)",
              }}>{tr(label)}</button>
            ))}
          </>
        }
      >
      {!housesQ.data ? (
        housesQ.error ? <LoadError onRetry={housesQ.reload} /> : <SkeletonRows rows={4} />
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
        {sortedHouses.map((h) => {
          const hTasks = tasks.filter((t) => t.house.id === h.id).sort((a, b) => cmpText(taskWhen(a), taskWhen(b)));
          const hTickets = sortTickets(tickets.filter((k) => k.house.id === h.id), "priority");
          const hasIssue = detailsReady && (hTickets.length > 0 || hTasks.some((t) => t.status === "WITH_ISSUE"));
          const ready = detailsReady && hTasks.length > 0 && !hasIssue && hTasks.every((t) => ["APPROVED", "COMPLETED"].includes(t.status));
          return (
            <div key={h.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, background: ready ? "#EEF6E6" : hasIssue ? "#F8E5E0" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {h.name}
                  {(h.validFrom || h.validUntil) && <span style={{ ...tag }}>{tr("Temporary")}</span>}
                </div>
                {canEditHouse && <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>}
              </div>

              {/* key status — pick any state directly */}
              <select value={h.keyStatus} onChange={(e) => setKey(h.id, e.target.value)} aria-label={tr("Key status")}
                style={{ ...S.input, padding: "7px 8px", fontSize: 12, marginBottom: 10, fontWeight: 600, background: keyBg[h.keyStatus] ?? "#fff" }}>
                {KEY_STATES.map((k) => <option key={k} value={k}>🔑 {ev(k)}</option>)}
              </select>

              {!detailsReady && <SkeletonRows rows={2} />}
              {detailsReady && <>
              {hTasks.length === 0 && <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>{tr("No tasks for this house.")}</p>}
              {hTasks.map((t) => (
                <div key={t.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 9px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <PriorityDot p={t.priority} />
                    <b>{t.scheduledTime}</b>
                    <span style={{ color: "var(--ink-soft)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.cleaningTypes.map(ev).join(", ")}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", margin: "4px 0 6px" }}>
                    {t.assignedWorker?.name ?? tr("Unassigned")}
                  </div>
                  <PhotoStrip photos={t.checklistData?.photos ?? []} size={44} />
                  {t.status === "TO_BE_VERIFIED" && (() => {
                    // Helps the person decide; it never approves anything by itself.
                    const r = checkReadiness(t, h, hTickets.filter((k) => k.status !== "REJECTED").length);
                    return (
                      <div style={{ fontSize: 11.5, margin: "2px 0 6px", color: r.ok ? "#4F7A26" : "#B3472E", fontWeight: 600 }}>
                        {r.ok ? `✓ ${tr("Auto-check: all clear")}` : `⚠ ${tr("Auto-check: needs attention")}`}
                        {!r.ok && (
                          <ul style={{ margin: "2px 0 0 16px", padding: 0, fontWeight: 400, color: "var(--ink-soft)" }}>
                            {r.reasons.map((x) => <li key={x}>{tr(REASON_TEXT[x])}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={S.small} onClick={() => setTaskEd({ task: t })}>{tr("Edit")}</button>
                    {t.status === "TO_BE_VERIFIED" && (
                      <>
                        <button style={S.smallDark} onClick={() => setReviewing(t)}>{tr("Review & confirm")}</button>
                      </>
                    )}
                    {["TO_BE_VERIFIED", "COMPLETED", "APPROVED"].includes(t.status) && (
                      <button style={S.small} onClick={() => sendBack(t.id, t.status)}>{tr("Send back")}</button>
                    )}
                    {t.status === "APPROVED" && (
                      <>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#4F7A26", alignSelf: "center" }}>{tr("✓ Ready")}</span>
                        <button style={S.small} onClick={() => undoApproval(t.id)}>{tr("Undo approval")}</button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {hTickets.length > 0 && (
                <div style={{ margin: "8px 0 6px" }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 4 }}>
                    {tr("Open maintenance: {n}", { n: hTickets.length })}
                  </div>
                  {hTickets.map((k) => (
                    <button key={k.id} onClick={() => setTicketEd({ ticket: k })} style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", fontSize: 11.5,
                      padding: "5px 8px", marginBottom: 4, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
                    }}>
                      <PriorityDot p={k.priority} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{MEDIA_ENABLED && k.photoUrl ? "📷 " : ""}{tr(k.description)}</span>
                      <StatusBadge status={k.status} />
                    </button>
                  ))}
                </div>
              )}
              </>}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <button style={S.small} onClick={() => setTaskEd({ task: null, houseId: h.id })}>+ {tr("Task")}</button>
                <button style={S.small} onClick={() => setTicketEd({ ticket: null, houseId: h.id })}>+ {tr("Issue")}</button>
                <button style={S.small} onClick={() => setMatEd({ houseId: h.id })}>+ {tr("Materials")}</button>
              </div>
            </div>
          );
        })}
      </div>
      {houses.length === 0 && <p style={{ color: "var(--ink-soft)", margin: 0 }}>{tr("No houses yet.")}</p>}
      </>
      )}
      </PanelCard>
      </>
      )}
      </div>

      {reviewing && detailsReady && (
        <TaskReview
          task={reviewing}
          house={houses.find((h) => h.id === reviewing.house.id)}
          openTickets={tickets.filter((k) => k.house.id === reviewing.house.id && k.status !== "REJECTED").length}
          confirmLabel={tr("Confirm ready for check-in")}
          onApprove={() => patchTask(reviewing.id, "approve")}
          onSendBack={() => patchTask(reviewing.id, "reopen")}
          onClose={() => setReviewing(null)}
        />
      )}

      {taskEd && lookupsReady && <TaskEditor task={taskEd.task} defaultHouseId={taskEd.houseId} houses={houseOpts} workers={workers} onClose={() => setTaskEd(null)} onSaved={done} />}
      {ticketEd && lookupsReady && <TicketEditor ticket={ticketEd.ticket} defaultHouseId={ticketEd.houseId} houses={houseOpts} workers={workers} onClose={() => setTicketEd(null)} onSaved={done} />}
      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={done} />}
      {matEd && <MaterialEditor defaultHouseId={matEd.houseId} houses={houseOpts} onClose={() => setMatEd(null)} onSaved={done} />}
    </PanelShell>
  );
}

const keyBg: Record<string, string> = { AT_OFFICE: "var(--green-bg)", WITH_CLEANER: "#FAF3D6", WITH_GUEST: "#E6F0F8", MISSING: "var(--red-bg)" };
const tag: React.CSSProperties = { fontSize: 9, fontWeight: 700, marginLeft: 6, padding: "1px 6px", borderRadius: 999, background: "#E6F0F8", textTransform: "uppercase", verticalAlign: "middle" };
