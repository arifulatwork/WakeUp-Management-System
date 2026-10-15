"use client";

import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import TaskEditor, { EdTask, EdWorker } from "@/components/editors/TaskEditor";
import TicketEditor from "@/components/editors/TicketEditor";
import TaskReview from "@/components/TaskReview";
import MaintenanceReview from "@/components/MaintenanceReview";
import { S, SortTh, useSort } from "@/components/ui";
import { applyDir, cmpText, dayKey, PRIORITY_RANK, TASK_STATUS_RANK, taskWhen } from "@/lib/sort";

const SECTIONS = ["stats", "tasks"] as const;
const SECTION_LABEL: Record<(typeof SECTIONS)[number], string> = { stats: "Overview", tasks: "Tasks" };

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const vis = useSectionVisibility("managerSections", SECTIONS);
  const { tr, ev, locale } = useI18n();
  const [ticketEd, setTicketEd] = useState(false);
  const [houses, setHouses] = useState<HouseInfo[]>([]);
  const [tickets, setTickets] = useState<any[]>([]) // open tickets (house, worker, media…) — also feeds the review card;
  // The task being reviewed before approval (Approve opens this pop-up; nothing is approved until "Confirm approve").
  const [reviewing, setReviewing] = useState<Task | null>(null);
  const [workers, setWorkers] = useState<EdWorker[]>([]);
  const sort = useSort<"house" | "type" | "time" | "priority" | "assigned" | "status">("time");
  const [taskEd, setTaskEd] = useState<{ task: Task | null } | null>(null);

  useEffect(() => {
    load();
  }, []);
  useLiveRefresh(load); // instant updates via /api/events (polls only as a safety net)

  async function load() {
    const [res, hRes, wRes, kRes] = await Promise.all([fetch("/api/tasks"), fetch("/api/houses"), fetch("/api/workers"), fetch("/api/tickets?open=1")]);
    setTasks(await res.json());
    setHouses(await hRes.json());
    setWorkers(await wRes.json());
    if (kRes.ok) setTickets(await kRes.json());
  }

  async function sendBack(id: string) {
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
    return { text: `${hhmm(start)} → ${t.completedAt ? hhmm(end) : "…"} · ${mins}${est ? ` / ${est}` : ""} min`, over: est > 0 && mins > est };
  };

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

  return (
    <PanelShell
      title={tr("Cleaning Tasks — Live")}
      vis={vis}
      labels={SECTION_LABEL}
      actions={
        <>
          <button style={S.navDark} onClick={() => setTaskEd({ task: null })}>+ {tr("New task")}</button>
          <button style={S.nav} onClick={() => setTicketEd(true)}>+ {tr("Report an Issue")}</button>
        </>
      }
    >
      {vis.shown.stats && (
        <StatGrid>
          <StatCard n={counts.scheduled} label={tr("Scheduled / assigned")} />
          <StatCard n={counts.issue} label={tr("With issue")} color="#C1503C" />
          <StatCard n={counts.verify} label={tr("To be verified")} color="#D98A33" />
          <StatCard n={counts.approved} label={tr("Approved")} color="#4F7A26" />
        </StatGrid>
      )}

      <MaintenanceReview tickets={tickets} onChanged={load} />

      {vis.shown.tasks && (
        <PanelCard title={tr("Tasks")} flush>
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
              {sortedTasks.map((t) => (
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
                    <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)", marginRight: 6 }} onClick={() => setTaskEd({ task: t })}>
                      {tr("Edit")}
                    </button>
                    {t.status === "APPROVED" && (
                      <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" }} onClick={() => undoApproval(t.id)}>
                        {tr("Undo approval")}
                      </button>
                    )}
                    {t.status === "TO_BE_VERIFIED" && (
                      <>
                        <button style={approveBtn} onClick={() => setReviewing(t)}>{tr("Approve")}</button>
                        <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)", marginLeft: 6 }} onClick={() => sendBack(t.id)}>
                          {tr("Send back")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <p style={{ color: "var(--ink-soft)", padding: 16, margin: 0 }}>{tr("No tasks yet.")}</p>}
        </PanelCard>
      )}

      {reviewing && (
        <TaskReview
          task={reviewing}
          house={houses.find((h) => h.id === reviewing.houseId)}
          openTickets={tickets.filter((k) => k.houseId === reviewing.houseId && k.status !== "REJECTED").length}
          onApprove={() => approve(reviewing.id)}
          onSendBack={() => sendBack(reviewing.id)}
          onClose={() => setReviewing(null)}
        />
      )}

      {ticketEd && (
        <TicketEditor
          ticket={null} houses={houses} workers={workers}
          onClose={() => setTicketEd(false)}
          onSaved={() => { setTicketEd(false); load(); }}
        />
      )}

      {taskEd && (
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
