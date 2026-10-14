"use client";

import FieldHeader from "@/components/FieldHeader";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { queueFetch } from "@/lib/offlineQueue";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { PhotoPicker, PhotoStrip } from "@/components/Photos";
import AppFooter from "@/components/AppFooter";
import { HouseThumb, HouseGallery } from "@/components/HouseMedia";
import { DONE_TASK, PRIORITY_RANK, taskWhen, cmpText } from "@/lib/sort";

type Task = {
  id: string;
  houseId: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string;
  priority?: string;
  cleaningTypes: string[];
  notes?: string | null;
  house: { name: string; address: string; hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null };
  checklistData: { checklist: { label: string; done: boolean }[]; photos?: string[] };
};

const AREAS = ["Bathroom", "Kitchen", "Bedroom", "Living room", "Outdoor", "Other"];
const PRIORITIES = ["YELLOW", "ORANGE", "RED"];

export default function CleanerApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueArea, setIssueArea] = useState(AREAS[0]);
  const [issuePriority, setIssuePriority] = useState("YELLOW");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueDone, setIssueDone] = useState(false);
  const [issuePhoto, setIssuePhoto] = useState<string | null>(null);
  const [requestingMaterials, setRequestingMaterials] = useState(false);
  const [materialsText, setMaterialsText] = useState("");
  const [materialsSubmitting, setMaterialsSubmitting] = useState(false);
  const [materialsDone, setMaterialsDone] = useState(false);
  const { tr, ev } = useI18n();
  const router = useRouter();

  useEffect(() => {
    const id = localStorage.getItem("workerId");
    setWorkerId(id);
    if (!id) return;
    // If this phone remembers a worker that no longer exists (demo data was
    // reset / server restarted), start over instead of showing an empty app.
    fetch(`/api/workers/${id}`).then((r) => {
      if (!r.ok) {
        ["workerId", "workerName", "workerArea"].forEach((k) => localStorage.removeItem(k));
        router.replace("/");
      } else {
        loadTasks(id);
      }
    });
  }, []);

  async function loadTasks(id: string) {
    const res = await fetch(`/api/tasks?workerId=${id}`);
    setTasks(await res.json());
  }
  // New or changed jobs show up straight away. Skipped while offline so queued taps are not overwritten.
  useLiveRefresh(() => {
    const id = localStorage.getItem("workerId");
    if (id && navigator.onLine) loadTasks(id);
  }, { models: ["cleaningTask", "house"] });

  // Every mutation below goes through queueFetch instead of raw fetch:
  // if there's no signal (common inside a house), the action is saved
  // to this device and synced automatically once back online — see
  // lib/offlineQueue.ts and the banner in components/OfflineBanner.tsx.
  // The UI updates immediately either way (optimistic), so a cleaner
  // never has to wonder whether a tap "took."

  async function startTask(task: Task) {
    setActiveTask({ ...task, status: "IN_PROGRESS" }); // optimistic
    await queueFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "start" }),
    });
    if (workerId) loadTasks(workerId);
  }

  async function toggleCheck(task: Task, index: number) {
    // Optimistic local toggle first — works even fully offline.
    const current = activeTask?.checklistData?.checklist ?? [];
    const next = current.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setActiveTask({ ...task, checklistData: { ...task.checklistData, checklist: next } });

    const result = await queueFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "toggleCheck", index }),
    });
    if (!result.queued) {
      const updated = await result.json();
      // The server's reply has no "house" attached, so keep the one we already have.
      setActiveTask((a) => ({ ...updated, house: updated.house ?? a?.house ?? task.house }));
    }
  }

  async function markReady(task: Task) {
    setActiveTask(null); // optimistic — back to house list immediately
    await queueFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "complete", workerId }),
    });
    if (workerId) loadTasks(workerId);
  }

  // Marked ready by mistake? Take it back before the coordinator verifies.
  async function undoReady(task: Task) {
    setActiveTask(null);
    await queueFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "undoReady" }),
    });
    if (workerId) loadTasks(workerId);
  }

  // Before/after photos. Shown immediately, uploaded in the background
  // (and kept in the offline queue if there's no signal in the house).
  async function addPhoto(task: Task, photo: string) {
    const patch = (t: Task): Task => ({ ...t, checklistData: { ...t.checklistData, photos: [...(t.checklistData.photos ?? []), photo] } });
    setActiveTask((a) => (a && a.id === task.id ? patch(a) : a));
    setTasks((ts) => ts.map((t) => (t.id === task.id ? patch(t) : t)));
    await queueFetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ action: "addPhoto", photo }) });
  }

  async function removePhoto(task: Task, index: number) {
    const patch = (t: Task): Task => ({ ...t, checklistData: { ...t.checklistData, photos: (t.checklistData.photos ?? []).filter((_, i) => i !== index) } });
    setActiveTask((a) => (a && a.id === task.id ? patch(a) : a));
    setTasks((ts) => ts.map((t) => (t.id === task.id ? patch(t) : t)));
    await queueFetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ action: "removePhoto", index }) });
  }

  async function submitIssue() {
    if (!activeTask || !workerId || !issueDesc.trim()) return;
    setIssueSubmitting(true);
    await queueFetch("/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        houseId: activeTask.houseId,
        area: issueArea,
        description: issueDesc.trim(),
        priority: issuePriority,
        photoUrl: issuePhoto,
        reportedById: workerId,
      }),
    });
    setIssueSubmitting(false);
    setIssueDone(true);
    if (workerId) loadTasks(workerId);
  }

  function closeIssueScreen() {
    setReportingIssue(false);
    setIssueDesc("");
    setIssuePhoto(null);
    setIssuePriority("YELLOW");
    setIssueArea(AREAS[0]);
    setIssueDone(false);
  }

  async function submitMaterials() {
    if (!activeTask || !workerId || !materialsText.trim()) return;
    setMaterialsSubmitting(true);
    await queueFetch("/api/materials", {
      method: "POST",
      body: JSON.stringify({
        houseId: activeTask.houseId,
        items: materialsText.trim(),
        requestedById: workerId,
      }),
    });
    setMaterialsSubmitting(false);
    setMaterialsDone(true);
  }

  function closeMaterialsScreen() {
    setRequestingMaterials(false);
    setMaterialsText("");
    setMaterialsDone(false);
  }

  if (!workerId) {
    return <p style={{ padding: 24 }}>{tr("Please sign in first.")} <a href="/">{tr("Sign in")}</a></p>;
  }

  // --- Issue report screen (feeds straight into the Maintenance module) ---
  if (activeTask && reportingIssue) {
    if (issueDone) {
      return (
        <main style={wrap}>
          <div style={{ textAlign: "center", padding: "60px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{tr("Ticket submitted")}</div>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 20 }}>
              {tr("Maintenance has been notified.")}
            </p>
            <button style={primaryBtn} onClick={closeIssueScreen}>{tr("Back to checklist")}</button>
          </div>
          <AppFooter />
        </main>
      );
    }
    return (
      <main style={wrap}>
        <button style={backBtn} onClick={closeIssueScreen}>&larr; {tr("Back")}</button>
        <h1 style={{ fontSize: 17, margin: "10px 0 2px" }}>{tr("Report an Issue")}</h1>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
          {tr("{house} — goes straight to Maintenance", { house: activeTask.house.name })}
        </p>

        <label style={label}>{tr("Area")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {AREAS.map((a) => (
            <button key={a} onClick={() => setIssueArea(a)} style={pill(issueArea === a)}>{tr(a)}</button>
          ))}
        </div>

        <label style={label}>{tr("Priority")}</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => setIssuePriority(p)} style={priorityPill(p, issuePriority === p)}>
              {ev(p)}
            </button>
          ))}
        </div>

        <label style={label}>{tr("What's wrong?")}</label>
        <textarea
          style={{ ...input, height: 80, marginBottom: 10 }}
          value={issueDesc}
          onChange={(e) => setIssueDesc(e.target.value)}
          placeholder={tr("e.g. Leaking pipe under the sink")}
        />

        {issuePhoto ? (
          <PhotoStrip photos={[issuePhoto]} size={96} onRemove={() => setIssuePhoto(null)} />
        ) : (
          <PhotoPicker label={`📷 ${tr("Attach photo")}`} style={ghostBtn} onPhoto={setIssuePhoto} />
        )}
        <button
          style={{ ...primaryBtn, opacity: issueDesc.trim() ? 1 : 0.5 }}
          disabled={!issueDesc.trim() || issueSubmitting}
          onClick={submitIssue}
        >
          {issueSubmitting ? tr("Submitting…") : tr("Submit to Maintenance")}
        </button>
        <AppFooter />
      </main>
    );
  }

  // --- Materials request screen ---
  if (activeTask && requestingMaterials) {
    if (materialsDone) {
      return (
        <main style={wrap}>
          <div style={{ textAlign: "center", padding: "60px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{tr("Request sent")}</div>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 20 }}>
              {tr("Your manager can see this on the Ops Overview board.")}
            </p>
            <button style={primaryBtn} onClick={closeMaterialsScreen}>{tr("Back to checklist")}</button>
          </div>
          <AppFooter />
        </main>
      );
    }
    return (
      <main style={wrap}>
        <button style={backBtn} onClick={closeMaterialsScreen}>&larr; {tr("Back")}</button>
        <h1 style={{ fontSize: 17, margin: "10px 0 2px" }}>{tr("Request Products / Materials")}</h1>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>{activeTask.house.name}</p>

        <label style={label}>{tr("What do you need?")}</label>
        <textarea
          style={{ ...input, height: 90, marginBottom: 10 }}
          value={materialsText}
          onChange={(e) => setMaterialsText(e.target.value)}
          placeholder={tr("e.g. Bathroom disinfectant x2, bin bags, hand soap")}
        />
        <button
          style={{ ...primaryBtn, opacity: materialsText.trim() ? 1 : 0.5 }}
          disabled={!materialsText.trim() || materialsSubmitting}
          onClick={submitMaterials}
        >
          {materialsSubmitting ? tr("Sending…") : tr("Send Request")}
        </button>
        <AppFooter />
      </main>
    );
  }

  // --- Task detail / checklist screen ---
  if (activeTask) {
    const checklist = activeTask.checklistData?.checklist ?? [];
    return (
      <main style={wrap}>
        <button style={backBtn} onClick={() => setActiveTask(null)}>&larr; {tr("Back")}</button>
        <h1 style={{ fontSize: 17, margin: "10px 0 2px" }}>{activeTask.house.name}</h1>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
          {activeTask.cleaningTypes.map(ev).join(", ")} · {activeTask.scheduledTime}
        </p>
        <HouseGallery houseId={activeTask.houseId} house={activeTask.house} />
        {activeTask.notes && (
          <p style={{ fontSize: 12, background: "#FAF3D6", borderRadius: 8, padding: "7px 10px", marginBottom: 12 }}>
            <b>{tr("Note")}:</b> {tr(activeTask.notes)}
          </p>
        )}

        {activeTask.status === "ASSIGNED" || activeTask.status === "SCHEDULED" ? (
          <button style={primaryBtn} onClick={() => startTask(activeTask)}>
            ▶ {tr("Start cleaning")}
          </button>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {checklist.map((item, i) => (
            <button key={i} style={checkRow} onClick={() => toggleCheck(activeTask, i)}>
              <span style={checkbox(item.done)}>{item.done ? "✓" : ""}</span>
              {tr(item.label)}
            </button>
          ))}
        </div>

        <PhotoPicker label={`📷 ${tr("Add before/after photo")}`} style={ghostBtn} onPhoto={(p) => addPhoto(activeTask, p)} />
        <PhotoStrip photos={activeTask.checklistData.photos ?? []} onRemove={(i) => removePhoto(activeTask, i)} />
        <button style={issueBtn} onClick={() => setReportingIssue(true)}>⚠ {tr("Report damage / issue")}</button>
        <button style={ghostBtn} onClick={() => setRequestingMaterials(true)}>📦 {tr("Request products / materials")}</button>
        {activeTask.status === "TO_BE_VERIFIED" ? (
          <button style={ghostBtn} onClick={() => undoReady(activeTask)}>
            ↩ {tr("Undo ready — keep cleaning")}
          </button>
        ) : (
          <button style={primaryBtn} onClick={() => markReady(activeTask)}>
            ✓ {tr("Mark ready for check-in")}
          </button>
        )}
        <AppFooter />
      </main>
    );
  }

  // --- House list screen ---
  // Order a cleaner actually works in: the job in progress first, then what's
  // next by day + time (urgent first if two share a time), finished jobs last.
  const sortedTasks = [...tasks].sort((a, b) => {
    const done = (t: Task) => (DONE_TASK.includes(t.status) ? 1 : 0);
    const current = (t: Task) => (t.status === "IN_PROGRESS" ? 0 : 1);
    return (
      done(a) - done(b) ||
      current(a) - current(b) ||
      cmpText(taskWhen(a), taskWhen(b)) ||
      (PRIORITY_RANK[a.priority ?? "YELLOW"] ?? 2) - (PRIORITY_RANK[b.priority ?? "YELLOW"] ?? 2)
    );
  });

  return (
    <main style={wrap}>
      <FieldHeader />
      <h1 style={{ fontSize: 17, marginBottom: 2 }}>{tr("My Houses — Today")}</h1>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
        {tr("{n} assigned", { n: tasks.length })}
      </p>
      {sortedTasks.map((task) => (
        <button key={task.id} style={houseCard} onClick={() => setActiveTask(task)}>
          <HouseThumb houseId={task.houseId} house={task.house} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: 13 }}>
              <span>{task.house.name}</span>
              <span style={statusBadge(task.status)}>{ev(task.status)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>
              {task.scheduledTime} · {task.cleaningTypes.map(ev).join(", ")}
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(task.house.address)}`}
              target="_blank"
              style={{ fontSize: 10.5, color: "var(--green-dark)" }}
              onClick={(e) => e.stopPropagation()}
            >
              📍 {tr("Open in Google Maps")}
            </a>
          </div>
        </button>
      ))}
      {tasks.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          <p>{tr("No tasks assigned yet.")}</p>
          {process.env.NEXT_PUBLIC_DEMO_MODE !== "false" && (
            <p style={{ marginTop: 10 }}><a href="/login">{tr("Switch demo user")}</a></p>
          )}
        </div>
      )}
      <AppFooter />
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 380, margin: "0 auto", padding: "20px 16px 60px" };
const houseCard: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", border: "1px solid var(--line)",
  borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: "#fff",
};
const checkRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", border: "1px solid var(--line)",
  borderRadius: 8, padding: "9px 10px", marginBottom: 6, background: "#fff", fontSize: 13, textAlign: "left",
};
const checkbox = (done: boolean): React.CSSProperties => ({
  width: 18, height: 18, borderRadius: 5, border: "2px solid var(--green-dark)",
  background: done ? "var(--green-dark)" : "#fff", color: "#fff", fontSize: 11,
  display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
});
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: 11, borderRadius: 10, border: "none", background: "var(--ink)",
  color: "#fff", fontSize: 13, fontWeight: 600, marginTop: 8,
};
const ghostBtn: React.CSSProperties = {
  width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--line)", background: "#fff",
  color: "var(--ink-soft)", fontSize: 13, fontWeight: 600, marginTop: 8,
};
const issueBtn: React.CSSProperties = {
  width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--red)", background: "var(--red-bg)",
  color: "var(--red)", fontSize: 13, fontWeight: 600, marginTop: 8,
};
const backBtn: React.CSSProperties = { border: "none", background: "none", color: "var(--ink-soft)", fontSize: 13, padding: 0 };
const label: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 6, color: "var(--ink-soft)" };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 };
const pill = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line)", fontSize: 11.5,
  background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink-soft)",
});
function priorityPill(p: string, on: boolean): React.CSSProperties {
  const color = p === "RED" ? "var(--red)" : p === "ORANGE" ? "#D98A33" : "#C7A623";
  return {
    flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${on ? color : "var(--line)"}`,
    background: on ? color : "#fff", color: on ? "#fff" : "var(--ink-soft)", fontSize: 12, fontWeight: 600,
  };
}
function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, string> = {
    SCHEDULED: "#EEE", ASSIGNED: "#FAF3D6", IN_PROGRESS: "#FBEDDB",
    TO_BE_VERIFIED: "#E6F0F8", APPROVED: "var(--green-bg)", WITH_ISSUE: "var(--red-bg)",
  };
  return {
    fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
    background: map[status] ?? "#EEE", textTransform: "uppercase",
  };
}
