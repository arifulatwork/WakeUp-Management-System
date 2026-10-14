"use client";

import FieldHeader from "@/components/FieldHeader";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { queueFetch } from "@/lib/offlineQueue";
import { useI18n } from "@/lib/i18n";
import { TicketSortBar } from "@/components/ui";
import { PhotoPicker, PhotoStrip } from "@/components/Photos";
import { sortTickets, TicketSort } from "@/lib/sort";

type Ticket = {
  id: string;
  area: string;
  description: string;
  priority: string;
  status: string;
  reportedAt: string;
  photoUrl?: string | null;
  house: { name: string };
  reportedBy: { name: string };
};

export default function MaintenanceApp() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [materials, setMaterials] = useState("");
  const [minutes, setMinutes] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [sort, setSort] = useState<TicketSort>("priority");
  const { tr, ev, locale } = useI18n();

  useEffect(() => {
    setWorkerId(localStorage.getItem("workerId"));
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/tickets?open=1");
    setTickets(await res.json());
  }
  // New issues appear on the phone straight away.
  useLiveRefresh(() => { if (navigator.onLine) load(); }, { models: ["maintenanceTicket"] });

  // Same offline-safe pattern as the cleaner app: optimistic status
  // update locally, queued-and-synced-later if there's no signal where
  // the maintenance worker is fixing the problem.
  const nextStatus: Record<string, string> = {
    accept: "ACCEPTED", reject: "REJECTED", start: "IN_PROGRESS", close: "CLOSED",
  };

  async function act(ticket: Ticket, action: string, extra: Record<string, unknown> = {}) {
    const optimisticStatus = nextStatus[action] ?? ticket.status;
    if (action === "close") setAfterPhoto(null);
    setActive(optimisticStatus === "CLOSED" || optimisticStatus === "REJECTED" ? null : { ...ticket, status: optimisticStatus });

    const result = await queueFetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, workerId, ...extra }),
    });
    if (!result.queued) {
      const updated = await result.json();
      setActive(updated.status === "CLOSED" || updated.status === "REJECTED" ? null : { ...ticket, ...updated });
    }
    load();
  }

  if (!workerId) {
    return <p style={{ padding: 24 }}>{tr("Please sign in first.")} <a href="/">{tr("Sign in")}</a></p>;
  }

  if (active) {
    return (
      <main style={wrap}>
        <button style={backBtn} onClick={() => { setActive(null); setAfterPhoto(null); }}>&larr; {tr("Back")}</button>
        <h1 style={{ fontSize: 17, margin: "10px 0 2px" }}>{active.house.name} · {tr(active.area)}</h1>
        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          {tr("Reported by {name}", { name: active.reportedBy.name })} · {new Date(active.reportedAt).toLocaleString(locale)}
        </p>
        <PriorityBadge p={active.priority} />
        <div style={{ ...card, marginTop: 10 }}>{tr(active.description)}</div>
        {active.photoUrl && <PhotoStrip photos={[active.photoUrl]} size={110} />}

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
            {afterPhoto ? (
              <PhotoStrip photos={[afterPhoto]} size={96} onRemove={() => setAfterPhoto(null)} />
            ) : (
              <PhotoPicker label={`📷 ${tr("Attach after-work photo")}`} style={ghostBtn} onPhoto={setAfterPhoto} />
            )}
            <button
              style={primaryBtn}
              onClick={() => act(active, "close", { materialsUsed: materials, timeSpentMinutes: Number(minutes) || null, afterPhotoUrl: afterPhoto })}
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
