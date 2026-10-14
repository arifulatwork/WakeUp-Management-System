"use client";

import Logo from "@/components/Logo";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import TaskEditor, { EdTask, EdWorker } from "@/components/editors/TaskEditor";
import { SortTh, useSort } from "@/components/ui";
import { applyDir, cmpText, PRIORITY_RANK, TASK_STATUS_RANK, taskWhen } from "@/lib/sort";

type Task = EdTask & {
  id: string;
  status: string;
  priority: string;
  scheduledTime: string;
  cleaningTypes: string[];
  house: { name: string };
  assignedWorker: { name: string } | null;
};

export default function ManagerDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [managerName, setManagerName] = useState<string>("");
  const { tr, ev } = useI18n();
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = useState<EdWorker[]>([]);
  const sort = useSort<"house" | "type" | "time" | "priority" | "assigned" | "status">("time");
  const [taskEd, setTaskEd] = useState<{ task: Task | null } | null>(null);

  useEffect(() => {
    // Whoever is logged in with role "manager" sees this screen — no
    // name is hardcoded. Super Admin can reassign the role to any
    // staff member at any time via /admin; it takes effect next login.
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((s) => s && setManagerName(s.name));
    load();
  }, []);
  useLiveRefresh(load); // instant updates via /api/events (polls only as a safety net)

  async function load() {
    const [res, hRes, wRes] = await Promise.all([fetch("/api/tasks"), fetch("/api/houses"), fetch("/api/workers")]);
    setTasks(await res.json());
    setHouses(await hRes.json());
    setWorkers(await wRes.json());
  }

  async function sendBack(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
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
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <Logo height={30} style={{ marginBottom: 10 }} />
          <h1 style={{ fontSize: 18, marginBottom: 2 }}>{tr("Cleaning Tasks — Live")}</h1>
          {managerName && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("Signed in as {name}", { name: managerName })} · {tr("Manager")}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...navLink, background: "var(--ink)", color: "#fff", border: "none", cursor: "pointer" }} onClick={() => setTaskEd({ task: null })}>
            + {tr("New task")}
          </button>
          <a href="/coordinator" style={navLink}>{tr("Check-in Readiness")}</a>
          <a href="/ops" style={navLink}>{tr("Ops Overview")}</a>
          <button
            style={{ ...navLink, cursor: "pointer" }}
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          >
            {tr("Sign out")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Stat n={counts.scheduled} label={tr("Scheduled / assigned")} />
        <Stat n={counts.issue} label={tr("With issue")} />
        <Stat n={counts.verify} label={tr("To be verified")} />
        <Stat n={counts.approved} label={tr("Approved")} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 }}>
        <thead>
          <tr>
            <SortTh label={tr("House")} k="house" sort={sort} style={th} />
            <SortTh label={tr("Type")} k="type" sort={sort} style={th} />
            <SortTh label={tr("Time")} k="time" sort={sort} style={th} />
            <SortTh label={tr("Priority")} k="priority" sort={sort} style={th} />
            <SortTh label={tr("Assigned to")} k="assigned" sort={sort} style={th} />
            <SortTh label={tr("Status")} k="status" sort={sort} style={th} />
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((t) => (
            <tr key={t.id}>
              <td style={td}>{t.house.name}</td>
              <td style={td}>{t.cleaningTypes.map(ev).join(", ")}</td>
              <td style={td}>{t.scheduledTime}</td>
              <td style={td}><PriorityDot p={t.priority} /></td>
              <td style={td}>{t.assignedWorker?.name ?? "—"}</td>
              <td style={td}><StatusBadge status={t.status} /></td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <button style={{ ...approveBtn, background: "#fff", color: "var(--ink)", border: "1px solid var(--line)", marginRight: 6 }} onClick={() => setTaskEd({ task: t })}>
                  {tr("Edit")}
                </button>
                {t.status === "TO_BE_VERIFIED" && (
                  <>
                    <button style={approveBtn} onClick={() => approve(t.id)}>{tr("Approve")}</button>
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
      {tasks.length === 0 && <p style={{ color: "var(--ink-soft)", marginTop: 14 }}>{tr("No tasks yet.")}</p>}

      {taskEd && (
        <TaskEditor
          task={taskEd.task} houses={houses} workers={workers}
          onClose={() => setTaskEd(null)}
          onSaved={() => { setTaskEd(null); load(); }}
        />
      )}
    </main>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", background: "#fff", minWidth: 120 }}>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{n}</div>
      <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{label}</div>
    </div>
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

const navLink: React.CSSProperties = { fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", textDecoration: "none" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)" };
const approveBtn: React.CSSProperties = { fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "none", background: "var(--ink)", color: "#fff" };
