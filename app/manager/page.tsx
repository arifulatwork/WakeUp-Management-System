"use client";

import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import TaskEditor, { EdTask, EdWorker } from "@/components/editors/TaskEditor";
import { Modal, S, SortTh, useSort } from "@/components/ui";
import { PhotoStrip } from "@/components/Photos";
import { HouseGallery } from "@/components/HouseMedia";
import { checkReadiness, REASON_TEXT } from "@/lib/readiness";
import { MEDIA_ENABLED } from "@/lib/features";
import { applyDir, cmpText, PRIORITY_RANK, TASK_STATUS_RANK, taskWhen } from "@/lib/sort";

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
};

export default function ManagerDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const vis = useSectionVisibility("managerSections", SECTIONS);
  const { tr, ev } = useI18n();
  const [houses, setHouses] = useState<HouseInfo[]>([]);
  const [tickets, setTickets] = useState<{ houseId?: string; status: string }[]>([]);
  // The task being reviewed before approval (Approve opens this pop-up; nothing is approved until "Confirm approve").
  const [reviewing, setReviewing] = useState<Task | null>(null);
  const [approving, setApproving] = useState(false);
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
    <PanelShell
      title={tr("Cleaning Tasks — Live")}
      vis={vis}
      labels={SECTION_LABEL}
      actions={<button style={S.navDark} onClick={() => setTaskEd({ task: null })}>+ {tr("New task")}</button>}
    >
      {vis.shown.stats && (
        <StatGrid>
          <StatCard n={counts.scheduled} label={tr("Scheduled / assigned")} />
          <StatCard n={counts.issue} label={tr("With issue")} color="#C1503C" />
          <StatCard n={counts.verify} label={tr("To be verified")} color="#D98A33" />
          <StatCard n={counts.approved} label={tr("Approved")} color="#4F7A26" />
        </StatGrid>
      )}

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

      {reviewing && (() => {
        // Review step: shows what the cleaner did (checklist, photos) and the automatic check.
        // The check only HELPS the decision; the manager still confirms (or sends back) by hand.
        const t = reviewing;
        const house = houses.find((h) => h.id === t.houseId);
        const openTickets = tickets.filter((k) => k.houseId === t.houseId && k.status !== "REJECTED").length;
        const r = checkReadiness(t, house, openTickets);
        const list = t.checklistData?.checklist ?? [];
        const photos = t.checklistData?.photos ?? [];
        return (
          <Modal title={tr("Review before approving")} onClose={() => setReviewing(null)}>
            <p style={{ fontSize: 13, margin: "8px 0 2px" }}>
              <b>{t.house.name}</b> · {t.scheduledTime} · {t.cleaningTypes.map(ev).join(", ")}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{t.assignedWorker?.name ?? tr("Unassigned")}</p>

            <div style={{ fontSize: 12.5, margin: "12px 0 4px", padding: "8px 10px", borderRadius: 9, fontWeight: 600,
              background: r.ok ? "var(--green-bg)" : "var(--red-bg)", color: r.ok ? "#4F7A26" : "#B3472E" }}>
              {r.ok ? `✓ ${tr("Auto-check: all clear")}` : `⚠ ${tr("Auto-check: needs attention")}`}
              {!r.ok && (
                <ul style={{ margin: "4px 0 0 16px", padding: 0, fontWeight: 400, color: "var(--ink-soft)" }}>
                  {r.reasons.map((x) => <li key={x}>{tr(REASON_TEXT[x])}</li>)}
                </ul>
              )}
            </div>

            <label style={S.label}>{tr("Checklist")}</label>
            {list.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{tr("No checklist items.")}</p>}
            {list.map((i, n) => (
              <div key={n} style={{ fontSize: 12.5, padding: "3px 0", color: i.done ? "var(--ink)" : "#B3472E" }}>
                {i.done ? "✓" : "✗"} {tr(i.label)}
              </div>
            ))}

            {MEDIA_ENABLED && (
              <>
                <label style={S.label}>{tr("Task photos")}</label>
                {photos.length > 0 ? <PhotoStrip photos={photos} size={84} /> : <p style={{ fontSize: 12, color: "#B3472E", margin: 0 }}>{tr("No photo added")}</p>}
                {house && (house.hasPhoto || house.hasVideo) && (
                  <>
                    <label style={S.label}>{tr("Apartment reference")}</label>
                    <HouseGallery houseId={house.id} house={house} />
                  </>
                )}
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button style={S.ghost} disabled={approving} onClick={async () => { setApproving(true); await sendBack(t.id); setApproving(false); setReviewing(null); }}>
                {tr("Send back")}
              </button>
              <button style={{ ...S.primary, opacity: approving ? 0.5 : 1 }} disabled={approving}
                onClick={async () => { setApproving(true); await approve(t.id); setApproving(false); setReviewing(null); }}>
                {tr("Confirm approve")}
              </button>
            </div>
          </Modal>
        );
      })()}

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
