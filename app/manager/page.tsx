"use client";

import dynamic from "next/dynamic";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
import { LoadError, SkeletonRows, useApiList } from "@/components/PanelKit";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { EdTask, EdWorker } from "@/components/editors/TaskEditor";
import { formatMinutes } from "@/lib/formatDuration";
import MaintenanceReview from "@/components/MaintenanceReview";
import { useCan } from "@/lib/useSession";
import { Pills, S, SortTh, useSort } from "@/components/ui";
import { Pager, norm } from "@/components/ordering/Pager";
import { applyDir, cmpText, dayKey, PRIORITY_RANK, TASK_STATUS_RANK, taskWhen } from "@/lib/sort";

const TASKS_PER_PAGE = 15;
// Status pills. "Active" = everything not approved yet, so nothing that needs attention is ever hidden.
const STATUS_FILTERS = ["ACTIVE", "SCHEDULED", "IN_PROGRESS", "WITH_ISSUE", "TO_BE_VERIFIED", "APPROVED", "ALL"];
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", SCHEDULED: "Scheduled / assigned", IN_PROGRESS: "In progress", WITH_ISSUE: "With issue",
  TO_BE_VERIFIED: "To be verified", APPROVED: "Approved", ALL: "All",
};
const DATE_FILTERS = ["ALL", "TODAY", "NEXT7", "PAST"];
const DATE_LABEL: Record<string, string> = { ALL: "All", TODAY: "Today", NEXT7: "Next 7 days", PAST: "Past" };
const NOBODY = "__none__"; // value of "Unassigned" in the person dropdown

// The editors and the review pop-up are only downloaded when somebody opens one.
const TaskEditor = dynamic(() => import("@/components/editors/TaskEditor"), { ssr: false });
const TicketEditor = dynamic(() => import("@/components/editors/TicketEditor"), { ssr: false });
const HouseEditor = dynamic(() => import("@/components/editors/HouseEditor"), { ssr: false });
const TaskReview = dynamic(() => import("@/components/TaskReview"), { ssr: false });

// Two tabs: the tasks table (opens first) and the maintenance work waiting for review.
const TABS = ["tasks", "maintenance"] as const;
type Tab = (typeof TABS)[number];

type HouseInfo = { id: string; name: string; keyStatus?: string; hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null };

type Task = EdTask & {
  id: string;
  status: string;
  priority: string;
  scheduledTime: string;
  cleaningTypes: string[];
  house: { name: string };
  assignedWorker: { name: string } | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export default function ManagerDashboard() {
  const { tr, ev, locale } = useI18n();
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "tasks");

  // Each part loads on its own, one after the other, and shows as soon as ITS data arrives:
  //  1. the tasks (what the manager came for)      2. the open maintenance tickets (review queue)
  //  3. houses + workers, only needed by the pop-ups. A slow part no longer holds back the others.
  const tasksQ = useApiList<Task[]>("/api/tasks", ["cleaningTask", "house", "worker"]);
  const tasksSettled = tasksQ.data !== null || tasksQ.error;
  const ticketsQ = useApiList<any[]>(tasksSettled ? "/api/tickets?open=1" : null, ["maintenanceTicket", "house", "worker"]);
  const [wantLookups, setWantLookups] = useState(false); // a pop-up was opened before the lists had arrived
  const lookupsOn = tasksSettled && (ticketsQ.data !== null || ticketsQ.error || wantLookups);
  const housesQ = useApiList<HouseInfo[]>(lookupsOn ? "/api/houses" : null, ["house"]);
  const workersQ = useApiList<EdWorker[]>(lookupsOn ? "/api/workers" : null, ["worker"]);
  const tasks = tasksQ.data ?? [];
  const tickets = ticketsQ.data ?? []; // open tickets (house, worker, media…) — also feeds the review card
  const houses = housesQ.data ?? [];
  const workers = workersQ.data ?? [];
  const lookupsReady = housesQ.data !== null && workersQ.data !== null;
  const [ticketEd, setTicketEd] = useState(false);
  // The task being reviewed before approval (Approve opens this pop-up; nothing is approved until "Confirm approve").
  const [reviewing, setReviewing] = useState<Task | null>(null);
  const sort = useSort<"house" | "type" | "time" | "priority" | "assigned" | "status">("time");
  const [taskEd, setTaskEd] = useState<{ task: Task | null } | null>(null);
  const [houseEd, setHouseEd] = useState(false);
  const [statusF, setStatusF] = useState("ACTIVE");
  const [dateF, setDateF] = useState("ALL");
  const [personF, setPersonF] = useState(""); // "" = everybody, NOBODY = unassigned, else a name
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [statusF, dateF, personF, q]);
  const canCreateHouse = useCan("houses.create");

  // After a change made here: reload what it touched. (Other people's changes arrive by themselves, live.)
  function load() {
    tasksQ.reload();
    ticketsQ.reload();
  }
  const openEditor = (open: () => void) => { setWantLookups(true); open(); };

  async function sendBack(id: string, status?: string) {
    // Sending back an already-approved job reopens it for the cleaner, so ask first.
    if (status === "APPROVED" && !window.confirm(tr("Send this approved job back to the cleaner?"))) return;
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    load();
  }

  async function undoApproval(id: string) {
    if (!window.confirm(tr("Take back the approval? The job goes back to To be verified."))) return;
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unapprove" }),
    });
    load();
  }

  async function approve(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    load();
  }

  // Quality & timing: when the cleaner started / finished and how long it really took vs the estimate.
  const hhmm = (v: Date) => v.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const timing = (t: Task) => {
    if (!t.startedAt) return null;
    const start = new Date(t.startedAt);
    const end = t.completedAt ? new Date(t.completedAt) : new Date();
    const mins = Math.max(0, Math.round((+end - +start) / 60000));
    const est = t.estimatedMinutes ?? 0;
    return { text: `${hhmm(start)} → ${t.completedAt ? hhmm(end) : "…"} · ${formatMinutes(mins)}${est ? ` / ${formatMinutes(est)}` : ""}`, over: est > 0 && mins > est };
  };

  const loaded = tasksQ.data !== null;
  const waitingReview = tickets.filter((k: any) => k.status === "TO_BE_VERIFIED").length;
  const counts = {
    scheduled: tasks.filter((t) => t.status === "SCHEDULED" || t.status === "ASSIGNED").length,
    issue: tasks.filter((t) => t.status === "WITH_ISSUE").length,
    verify: tasks.filter((t) => t.status === "TO_BE_VERIFIED").length,
    approved: tasks.filter((t) => t.status === "APPROVED").length,
  };

  // Whatever column is chosen, ties fall back to day+time, then house — and
  // unassigned jobs always sit last when sorting by person.
  const sortedTasks = [...tasks].sort((a, b) => {
    const tie = cmpText(taskWhen(a), taskWhen(b)) || cmpText(a.house.name, b.house.name);
    let c = 0;
    switch (sort.key) {
      case "house": c = cmpText(a.house.name, b.house.name); break;
      case "type": c = cmpText(a.cleaningTypes[0], b.cleaningTypes[0]); break;
      case "time": c = cmpText(taskWhen(a), taskWhen(b)); break;
      case "priority": c = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]; break;
      case "status": c = TASK_STATUS_RANK[a.status] - TASK_STATUS_RANK[b.status]; break;
      case "assigned": {
        const an = a.assignedWorker?.name, bn = b.assignedWorker?.name;
        if (!an !== !bn) return an ? -1 : 1;
        c = cmpText(an, bn);
      }
    }
    return applyDir(c, sort.dir) || tie;
  });

  // ---- filters + paging (sorting above is untouched) ----
  const statusMatch = (t: Task, f: string) =>
    f === "ALL" ? true
    : f === "ACTIVE" ? t.status !== "APPROVED"
    : f === "SCHEDULED" ? t.status === "SCHEDULED" || t.status === "ASSIGNED"
    : t.status === f;
  const todayKey = dayKey(new Date());
  const in7Key = dayKey(new Date(Date.now() + 7 * 86400000));
  const dateMatch = (t: Task, f: string) => {
    const d = dayKey(t.scheduledDate);
    return f === "TODAY" ? d === todayKey : f === "NEXT7" ? d >= todayKey && d <= in7Key : f === "PAST" ? d < todayKey : true;
  };
  const people = Array.from(new Set(tasks.map((t) => t.assignedWorker?.name).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b));
  const needle = norm(q.trim());
  const filteredTasks = sortedTasks.filter((t) =>
    statusMatch(t, statusF) && dateMatch(t, dateF) &&
    (!personF || (personF === NOBODY ? !t.assignedWorker : t.assignedWorker?.name === personF)) &&
    (!needle || [t.house.name, t.assignedWorker?.name, ...t.cleaningTypes.map(ev)].some((v) => norm(v).includes(needle))));
  const pages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PER_PAGE));
  const curPage = Math.min(page, pages);
  const pagedTasks = filteredTasks.slice((curPage - 1) * TASKS_PER_PAGE, (curPage - 1) * TASKS_PER_PAGE + TASKS_PER_PAGE);
  const statusCount = (f: string) => tasks.filter((t) => statusMatch(t, f)).length;

  return (
    <PanelShell
      title={tr("Cleaning Tasks — Live")}
      actions={
        <>
          <button style={S.navDark} onClick={() => openEditor(() => setTaskEd({ task: null }))}>+ {tr("New task")}</button>
          <button style={S.nav} onClick={() => openEditor(() => setTicketEd(true))}>+ {tr("Report an Issue")}</button>
          {canCreateHouse && <button style={S.nav} onClick={() => setHouseEd(true)}>+ {tr("New house")}</button>}
        </>
      }
    >
      <PanelTabs
        tabs={[
          { id: "tasks" as const, label: tr("Tasks") },
          { id: "maintenance" as const, label: tr("Maintenance to review"), badge: waitingReview },
        ]}
        value={tab}
        onChange={chooseTab}
        label={tr("Cleaning Tasks — Live")}
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

      {tab === "tasks" && (
        <>
        <StatGrid>
          <StatCard n={loaded ? counts.scheduled : "…"} label={tr("Scheduled / assigned")} />
          <StatCard n={loaded ? counts.issue : "…"} label={tr("With issue")} color="#C1503C" />
          <StatCard n={loaded ? counts.verify : "…"} label={tr("To be verified")} color="#D98A33" />
          <StatCard n={loaded ? counts.approved : "…"} label={tr("Approved")} color="#4F7A26" />
        </StatGrid>

        <PanelCard title={loaded ? `${tr("Tasks")} (${filteredTasks.length})` : tr("Tasks")} flush>
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--line)" }}>
            <Pills options={STATUS_FILTERS} value={statusF} onChange={setStatusF} label={(f) => `${tr(STATUS_LABEL[f])} (${statusCount(f)})`} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 4 }}>
              <div style={{ flex: "2 1 200px", minWidth: 0 }}>
                <label style={S.label}>{tr("Search")}</label>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} aria-label={tr("Search houses, cleaners or cleaning types…")}
                  placeholder={tr("Search houses, cleaners or cleaning types…")} style={{ ...S.input, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                <label style={S.label}>{tr("Assigned to")}</label>
                <select aria-label={tr("Assigned to")} style={{ ...S.input, width: "100%", minWidth: 0, boxSizing: "border-box" }} value={personF} onChange={(e) => setPersonF(e.target.value)}>
                  <option value="">{tr("All")}</option>
                  <option value={NOBODY}>{tr("Unassigned")}</option>
                  {people.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <label style={S.label}>{tr("Date")}</label>
                <Pills options={DATE_FILTERS} value={dateF} onChange={setDateF} label={(f) => tr(DATE_LABEL[f])} />
              </div>
            </div>
          </div>
          {!loaded ? (
            tasksQ.error ? <LoadError onRetry={tasksQ.reload} /> : <SkeletonRows rows={6} />
          ) : (
          <>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 }}>
            <thead>
              <tr>
                <SortTh label={tr("House")} k="house" sort={sort} style={th} />
                <SortTh label={tr("Type")} k="type" sort={sort} style={th} />
                <SortTh label={tr("Time")} k="time" sort={sort} style={th} />
                <SortTh label={tr("Priority")} k="priority" sort={sort} style={th} />
                <SortTh label={tr("Assigned to")} k="assigned" sort={sort} style={th} />
                <SortTh label={tr("Status")} k="status" sort={sort} style={th} />
                <th style={th}>{tr("Timing")}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{t.house.name}</td>
                  <td style={td}>{t.cleaningTypes.map(ev).join(", ")}</td>
                  <td style={td}>{t.scheduledTime}<div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{dayKey(t.scheduledDate)}</div></td>
                  <td style={td}><PriorityDot p={t.priority} /></td>
                  <td style={td}>{t.assignedWorker?.name ?? "—"}</td>
                  <td style={td}><StatusBadge status={t.status} /></td>
                  <td style={{ ...td, fontSize: 11.5, whiteSpace: "nowrap", color: timing(t)?.over ? "#B3472E" : "var(--ink)", fontWeight: timing(t)?.over ? 700 : 400 }}>
                    {timing(t)?.text ?? "—"}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)", marginRight: 6 }} onClick={() => openEditor(() => setTaskEd({ task: t }))}>
                      {tr("Edit")}
                    </button>
                    {t.status === "APPROVED" && (
                      <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" }} onClick={() => undoApproval(t.id)}>
                        {tr("Undo approval")}
                      </button>
                    )}
                    {t.status === "TO_BE_VERIFIED" && (
                      <button style={approveBtn} onClick={() => { setWantLookups(true); setReviewing(t); }}>{tr("Approve")}</button>
                    )}
                    {["TO_BE_VERIFIED", "COMPLETED", "APPROVED"].includes(t.status) && (
                      <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)", marginLeft: 6 }} onClick={() => sendBack(t.id, t.status)}>
                        {tr("Send back")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredTasks.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{tr("No matching tasks.")}</p>}
          <Pager page={curPage} pages={pages} onPage={setPage} />
          {tasks.length === 0 && <p style={{ color: "var(--ink-soft)", padding: 16, margin: 0 }}>{tr("No tasks yet.")}</p>}
          </>
          )}
        </PanelCard>
        </>
      )}
      </div>

      {reviewing && lookupsReady && (
        <TaskReview
          task={reviewing}
          house={houses.find((h) => h.id === reviewing.houseId)}
          openTickets={tickets.filter((k) => k.houseId === reviewing.houseId && k.status !== "REJECTED").length}
          onApprove={() => approve(reviewing.id)}
          onSendBack={() => sendBack(reviewing.id)}
          onClose={() => setReviewing(null)}
        />
      )}

      {ticketEd && lookupsReady && (
        <TicketEditor
          ticket={null} houses={houses} workers={workers}
          onClose={() => setTicketEd(false)}
          onSaved={() => { setTicketEd(false); load(); }}
        />
      )}

      {houseEd && <HouseEditor house={null} onClose={() => setHouseEd(false)} onSaved={() => { setHouseEd(false); load(); }} />}

      {taskEd && lookupsReady && (
        <TaskEditor
          task={taskEd.task} houses={houses} workers={workers}
          onClose={() => setTaskEd(null)}
          onSaved={() => { setTaskEd(null); load(); }}
        />
      )}
    </PanelShell>
  );
}

function PriorityDot({ p }: { p: string }) {
  const color = p === "RED" ? "var(--red)" : p === "ORANGE" ? "var(--orange)" : "var(--yellow)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

function StatusBadge({ status }: { status: string }) {
  const { ev } = useI18n();
  const map: Record<string, string> = {
    SCHEDULED: "#EEE", ASSIGNED: "#FAF3D6", IN_PROGRESS: "#FBEDDB", ON_HOLD: "#FBEDDB",
    COMPLETED: "var(--green-bg)", TO_BE_VERIFIED: "#E6F0F8", APPROVED: "var(--green-bg)",
    WITH_ISSUE: "var(--red-bg)",
  };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: map[status] ?? "#EEE", textTransform: "uppercase" }}>
      {ev(status)}
    </span>
  );
}

const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)" };
const approveBtn: React.CSSProperties = { fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "none", background: "var(--ink)", color: "#fff" };
