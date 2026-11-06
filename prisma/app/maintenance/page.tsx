"use client";

import FieldHeader from "@/components/FieldHeader";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { queueFetch } from "@/lib/offlineQueue";
import { useI18n } from "@/lib/i18n";
import { TicketSortBar } from "@/components/ui";
import { PhotoPicker, PhotoStrip, VideoPicker, VideoStrip } from "@/components/Photos";
import { sortTickets, TicketSort } from "@/lib/sort";

type Ticket = {
  id: string;
  area: string;
  description: string;
  priority: string;
  status: string;
  reportedAt: string;
  startedAt?: string | null;
  closedAt?: string | null;
  materialsUsed?: string | null;
  timeSpentMinutes?: number | null;
  photoUrl?: string | null;
  assignedWorkerId?: string | null;
  mediaData?: { photos?: string[]; videos?: string[]; reportVideos?: string[] } | null;
  house: { name: string };
  reportedBy: { name: string };
};

export default function MaintenanceApp() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [done, setDone] = useState<Ticket[]>([]);
  const [doneLimit, setDoneLimit] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Ticket | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [materials, setMaterials] = useState("");
  const [minutes, setMinutes] = useState("");
  const [sort, setSort] = useState<TicketSort>("priority");
  const { tr, ev, locale } = useI18n();

  useEffect(() => {
    setWorkerId(localStorage.getItem("workerId"));
    load();
  }, []);

  // Time spent = now minus the moment "Start intervention" was tapped. Filled in for the worker,
  // who can still change it before closing.
  useEffect(() => {
    if (active?.status !== "IN_PROGRESS") { setMinutes(""); return; }
    if (active.timeSpentMinutes) {
      // Closed and taken back: restore what the worker had entered instead of recalculating
      // (recalculating would also count the time the ticket sat closed).
      setMinutes(String(active.timeSpentMinutes));
    } else if (active.startedAt) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(active.startedAt).getTime()) / 60000));
      setMinutes(String(mins));
    } else {
      setMinutes("");
    }
    setMaterials(active.materialsUsed ?? "");
  }, [active?.id, active?.status, active?.startedAt, active?.timeSpentMinutes]);

  async function load() {
    const res = await fetch("/api/tickets?open=1&queue=1");
    setTickets(await res.json());
    loadDone();
  }
  // The worker's own finished tickets (History), newest first.
  async function loadDone() {
    const id = localStorage.getItem("workerId");
    const res = await fetch(`/api/tickets?mine=1&closed=1${id ? `&workerId=${encodeURIComponent(id)}` : ""}`);
    if (res.ok) setDone(await res.json());
  }
  // New issues appear on the phone straight away.
  useLiveRefresh(() => { if (navigator.onLine) load(); }, { models: ["maintenanceTicket"] });

  // Same offline-safe pattern as the cleaner app: optimistic status
  // update locally, queued-and-synced-later if there's no signal where
  // the maintenance worker is fixing the problem.
  const nextStatus: Record<string, string> = {
    accept: "ACCEPTED", reject: "REJECTED", start: "IN_PROGRESS", close: "TO_BE_VERIFIED",
  };

  async function act(ticket: Ticket, action: string, extra: Record<string, unknown> = {}) {
    const optimisticStatus = nextStatus[action] ?? ticket.status;
    setActive(optimisticStatus === "TO_BE_VERIFIED" || optimisticStatus === "REJECTED" ? null : {
      ...ticket, status: optimisticStatus,
      ...(action === "start" ? { startedAt: new Date().toISOString() } : {}), // works offline too
    });

    const result = await queueFetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, workerId, ...extra }),
    });
    if (!result.queued && !result.ok) {
      // Refused (e.g. another worker already took this ticket): undo the optimistic change and refresh.
      setActive(null);
      setError(tr("Could not save. Please try again."));
      load();
      return;
    }
    if (!result.queued) {
      const updated = await result.json();
      setActive(updated.status === "TO_BE_VERIFIED" || updated.status === "REJECTED" ? null : { ...ticket, ...updated });
    }
    load();
  }

  // Photos / videos while working. Shown straight away, uploaded in the background
  // (kept in the offline queue if there is no signal at the house).
  async function addMedia(ticket: Ticket, kind: "photos" | "videos", item: string) {
    const patch = (t: Ticket): Ticket => ({ ...t, mediaData: { ...t.mediaData, [kind]: [...(t.mediaData?.[kind] ?? []), item] } });
    setActive((a) => (a && a.id === ticket.id ? patch(a) : a));
    const r = await queueFetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: kind === "photos" ? "addPhoto" : "addVideo", workerId, [kind === "photos" ? "photo" : "video"]: item }),
    });
    if (!r.ok) { setError(tr("Could not save. Please try again.")); load(); }
  }
  async function removeMedia(ticket: Ticket, kind: "photos" | "videos", index: number) {
    const patch = (t: Ticket): Ticket => ({ ...t, mediaData: { ...t.mediaData, [kind]: (t.mediaData?.[kind] ?? []).filter((_, i) => i !== index) } });
    setActive((a) => (a && a.id === ticket.id ? patch(a) : a));
    const r = await queueFetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: kind === "photos" ? "removePhoto" : "removeVideo", workerId, index }),
    });
    if (!r.ok) { setError(tr("Could not save. Please try again.")); load(); }
  }

  // Closed by mistake? Take it back: it returns to "In progress" and opens so work can continue.
  async function undoClose(ticket: Ticket) {
    if (!window.confirm(tr("Take back this closed ticket? It goes back to In progress."))) return;
    setError(null);
    const r = await queueFetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "undoClose", workerId }),
    });
    if (!r.queued && !r.ok) {
      setError(tr("Could not save. Please try again."));
      load();
      return;
    }
    const back = { ...ticket, status: "IN_PROGRESS", closedAt: null }; // keeps materials + time
    setDone((d) => d.filter((t) => t.id !== ticket.id)); // instantly, also offline
    setActive(r.queued ? back : { ...back, ...(await r.json()) });
    load();
  }

  if (!workerId) {
    return <p style={{ padding: 24 }}>{tr("Please sign in first.")} <a href="/">{tr("Sign in")}</a></p>;
  }

  if (active) {
    return (
      <main style={wrap}>
        <button style={backBtn} onClick={() => setActive(null)}>&larr; {tr("Back")}</button>
        <h1 style={{ fontSize: 17, margin: "10px 0 2px" }}>{active.house.name} · {tr(active.area)}</h1>
        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          {tr("Reported by {name}", { name: active.reportedBy.name })} · {new Date(active.reportedAt).toLocaleString(locale)}
        </p>
        <PriorityBadge p={active.priority} />
        <div style={{ ...card, marginTop: 10 }}>{tr(active.description)}</div>
        {active.photoUrl && <PhotoStrip photos={[active.photoUrl]} size={110} />}
        <VideoStrip videos={active.mediaData?.reportVideos ?? []} />

        {active.status === "OPEN" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...primaryBtn, flex: 1 }} onClick={() => act(active, "accept")}>{tr("Accept")}</button>
            <button style={{ ...ghostBtn, flex: 1, marginTop: 0 }} onClick={() => act(active, "reject")}>{tr("Reject")}</button>
          </div>
        )}

        {active.status === "ACCEPTED" && (
          <button style={primaryBtn} onClick={() => act(active, "start")}>▶ {tr("Start intervention")}</button>
        )}

        {active.status === "IN_PROGRESS" && (
          <>
            <label style={label}>{tr("Materials used")}</label>
            <input style={input} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder={tr("e.g. pipe seal, wrench")} />
            <label style={{ ...label, marginTop: 10 }}>{tr("Time spent (minutes)")}</label>
            <input style={input} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" />
            {active.startedAt && !active.timeSpentMinutes && <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "0 0 6px" }}>{tr("Time is calculated from the start time — you can change it.")}</p>}
            {/* Same as the cleaner app: buttons stay visible but greyed out ("Coming soon") while media is off. */}
            <PhotoPicker showWhenOff label={`📷 ${tr("Attach after-work photo")}`} style={ghostBtn} onPhoto={(p) => addMedia(active, "photos", p)} />
            <PhotoStrip photos={active.mediaData?.photos ?? []} onRemove={(i) => removeMedia(active, "photos", i)} />
            <VideoPicker showWhenOff label={`🎥 ${tr("Add after-work video")}`} style={ghostBtn} onVideo={(v) => addMedia(active, "videos", v)} />
            <VideoStrip videos={active.mediaData?.videos ?? []} onRemove={(i) => removeMedia(active, "videos", i)} />
            <button
              style={primaryBtn}
              onClick={() => act(active, "close", { materialsUsed: materials, timeSpentMinutes: Number(minutes) || null })}
            >
              ✓ {tr("Close ticket")}
            </button>
          </>
        )}
      </main>
    );
  }

  // Rejected tickets are out of the queue; ordering is done here so the buttons respond instantly.
  const sorted = sortTickets(tickets.filter((t) => t.status !== "REJECTED"), sort);

  return (
    <main style={wrap}>
      <FieldHeader />
      <h1 style={{ fontSize: 17, marginBottom: 2 }}>{tr("Open Tickets")}</h1>
      <TicketSortBar value={sort} onChange={setSort} />
      {sorted.map((t) => (
        <button key={t.id} style={card} onClick={() => setActive(t)}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
            <span>{t.house.name} · {tr(t.area)}</span>
            <PriorityBadge p={t.priority} />
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3 }}>{tr(t.description)}</div>
          <div style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>
            {ev(t.status)} · {new Date(t.reportedAt).toLocaleTimeString(locale)}
          </div>
        </button>
      ))}
      {sorted.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{tr("No open tickets.")}</p>}
      {error && <p style={{ fontSize: 12, color: "#C1503C", fontWeight: 600 }}>{error}</p>}

      <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", margin: "18px 0 8px" }}>
        {tr("Done tickets")} ({done.length})
      </p>
      {done.slice(0, doneLimit).map((t) => (
        <div key={t.id} style={{ ...card, cursor: "default" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
            <span>{t.house.name} · {tr(t.area)}</span>
            {t.status === "TO_BE_VERIFIED"
              ? <span style={{ fontSize: 10, fontWeight: 700, color: "#3B6E9E" }}>⏳ {tr("Waiting for review")}</span>
              : <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-dark)" }}>✓ {ev("CLOSED")}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3 }}>{tr(t.description)}</div>
          <div style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>
            {t.closedAt && tr("Closed {time}", { time: new Date(t.closedAt).toLocaleString(locale) })}
            {t.timeSpentMinutes ? ` · ${tr("Time spent: {minutes} min", { minutes: t.timeSpentMinutes })}` : ""}
          </div>
          {t.materialsUsed && <div style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>{tr("Materials: {materials}", { materials: t.materialsUsed })}</div>}
          <PhotoStrip photos={t.mediaData?.photos ?? []} size={56} />
          <VideoStrip videos={t.mediaData?.videos ?? []} />
          {/* Only until the office has confirmed it; after that the office sends it back if needed. */}
          {t.status === "TO_BE_VERIFIED" && t.assignedWorkerId && (
            <button style={{ ...ghostBtn, marginTop: 8, padding: 8, fontSize: 12 }} onClick={() => undoClose(t)}>
              ↩ {tr("Undo close — keep working")}
            </button>
          )}
        </div>
      ))}
      {done.length > doneLimit && (
        <button style={ghostBtn} onClick={() => setDoneLimit((n) => n + 15)}>{tr("Show more")}</button>
      )}
      {done.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("No done tickets yet.")}</p>}
    </main>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const { ev } = useI18n();
  const map: Record<string, { bg: string; fg: string }> = {
    RED: { bg: "#F8E5E0", fg: "#C1503C" },
    ORANGE: { bg: "#FBEDDB", fg: "#D98A33" },
    YELLOW: { bg: "#FAF3D6", fg: "#C7A623" },
  };
  const c = map[p] ?? map.YELLOW;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.fg, textTransform: "uppercase" }}>
      {ev(p)}
    </span>
  );
}

const wrap: React.CSSProperties = { maxWidth: 380, margin: "0 auto", padding: "20px 16px 60px" };
const card: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: "#fff", fontSize: 13 };
const backBtn: React.CSSProperties = { border: "none", background: "none", color: "var(--ink-soft)", fontSize: 13, padding: 0 };
const label: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 6, color: "var(--ink-soft)" };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, marginBottom: 4 };
const primaryBtn: React.CSSProperties = { width: "100%", padding: 11, borderRadius: 10, border: "none", background: "var(--ink)", color: "#fff", fontSize: 13, fontWeight: 600, marginTop: 10 };
const ghostBtn: React.CSSProperties = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--line)", background: "#fff", color: "var(--ink-soft)", fontSize: 13, fontWeight: 600, marginTop: 10 };
