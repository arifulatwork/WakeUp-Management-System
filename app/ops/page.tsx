"use client";

import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { useEffect, useState, useCallback } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useCan } from "@/lib/useSession";
import { S, StatusBadge, PriorityDot, TicketSortBar } from "@/components/ui";
import { PhotoStrip } from "@/components/Photos";
import { cmpText, dayKey, KEY_RANK, sortTickets, TicketSort } from "@/lib/sort";
import TicketEditor, { EdTicket } from "@/components/editors/TicketEditor";
import MaintenanceReview from "@/components/MaintenanceReview";
import HouseEditor, { EdHouseFull } from "@/components/editors/HouseEditor";
import MaterialEditor, { EdMaterial } from "@/components/editors/MaterialEditor";
import { EdWorker } from "@/components/editors/TaskEditor";

type Task = {
  id: string; houseId: string; status: string; scheduledDate: string; scheduledTime: string;
  estimatedMinutes?: number | null; startedAt?: string | null; completedAt?: string | null;
  assignedWorker: { name: string } | null; house: { name: string };
};
type Ticket = EdTicket & { house: { id: string; name: string }; reportedBy: { name: string } };
type MaterialReq = EdMaterial & { fulfilledAt?: string | null; house: { id: string; name: string }; requestedBy: { name: string }; createdAt: string };

const SECTIONS = ["stats", "tickets", "materials", "keys", "workload"] as const;
const SECTION_LABEL: Record<(typeof SECTIONS)[number], string> = {
  stats: "Overview", tickets: "Tickets", materials: "Materials", keys: "Keys", workload: "Workload",
};

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];

// The single screen Manager / Ops check first each morning. Every list is
// editable: tickets, material requests, houses and key status.
export default function OpsOverview() {
  const { tr, ev } = useI18n();
  const canCreateHouse = useCan("houses.create");
  const canEditHouse = useCan("houses.edit");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [materials, setMaterials] = useState<MaterialReq[]>([]);
  const [houses, setHouses] = useState<EdHouseFull[]>([]);
  const [workers, setWorkers] = useState<EdWorker[]>([]);
  const [ticketSort, setTicketSort] = useState<TicketSort>("priority");
  const vis = useSectionVisibility("opsSections", SECTIONS);
  const shown = vis.shown;

  const [ticketEd, setTicketEd] = useState<{ ticket: Ticket | null } | null>(null);
  const [matEd, setMatEd] = useState<{ request: MaterialReq | null } | null>(null);
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);

  // Each list loads on its own: one slow or failing request can no longer stop the others
  // from updating, and nothing is served from a browser cache after an edit.
  const load = useCallback(async () => {
    const get = async (url: string) => {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(url);
      return res.json();
    };
    const [t, k, m, h, w] = await Promise.allSettled([
      get("/api/tasks"), get("/api/tickets"), get("/api/materials"), get("/api/houses"), get("/api/workers"),
    ]);
    if (t.status === "fulfilled") setTasks(t.value);
    if (k.status === "fulfilled") setTickets(k.value);
    if (m.status === "fulfilled") setMaterials(m.value);
    if (h.status === "fulfilled") setHouses(h.value);
    if (w.status === "fulfilled") setWorkers(w.value);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load);

  const saved = () => { setTicketEd(null); setMatEd(null); setHouseEd(null); load(); };

  async function materialAction(id: string, action: "fulfill" | "reopen") {
    await api(`/api/materials/${id}`, "PATCH", { action });
    load();
  }
  async function setKey(id: string, keyStatus: string) {
    setHouses((hs) => hs.map((h) => (h.id === id ? { ...h, keyStatus } : h)));
    await api(`/api/houses/${id}`, "PATCH", { keyStatus });
    load();
  }
  async function ticketStatus(id: string, action: string) {
    await api(`/api/tickets/${id}`, "PATCH", { action });
    load();
  }

  const today = new Date().toDateString();
  const finished = ["APPROVED", "COMPLETED"];
  const completedToday = tasks.filter((t) => finished.includes(t.status) && new Date(t.scheduledDate).toDateString() === today).length;
  const openTasks = tasks.filter((t) => !finished.includes(t.status)).length;
  const openTickets = sortTickets(tickets.filter((t) => !["CLOSED", "REJECTED"].includes(t.status)), ticketSort);
  const rejectedTickets = tickets.filter((t) => t.status === "REJECTED");
  const urgent = openTickets.filter((t) => t.priority === "RED").length;
  // Overdue = the scheduled day AND time have passed and the cleaner has not finished.
  // (Dates are stored at noon, so the time of day has to be added here. A job already
  // handed in and waiting to be verified is not overdue any more.)
  const now = new Date();
  const when = (t: Task) => new Date(`${dayKey(t.scheduledDate)}T${t.scheduledTime || "00:00"}:00`);
  const overdue = tasks.filter((t) => !finished.includes(t.status) && t.status !== "TO_BE_VERIFIED" && when(t) < now).length;
  // Houses with something happening today or still unfinished (not "number of tasks").
  const todayKey = dayKey(now);
  const activeHouses = new Set(tasks.filter((t) => dayKey(t.scheduledDate) === todayKey || !finished.includes(t.status)).map((t) => t.houseId)).size;
  // Requests: whoever has waited longest is first; "fulfilled" shows the latest few.
  const pending = materials.filter((m) => m.status === "PENDING").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const recentDone = materials
    .filter((m) => m.status === "FULFILLED")
    .sort((a, b) => +new Date(b.fulfilledAt ?? b.createdAt) - +new Date(a.fulfilledAt ?? a.createdAt))
    .slice(0, 3);
  // Keys: anything unusual (missing, out with someone) before keys sitting at the office.
  const sortedHouses = [...houses].sort((a, b) => KEY_RANK[a.keyStatus] - KEY_RANK[b.keyStatus] || cmpText(a.name, b.name));

  // Daily workload per person, in minutes: time already worked today (from the real start/finish
  // times) and time still planned (estimates of today's jobs that are not done yet).
  type Load = { worked: number; planned: number; open: number };
  const loads = new Map<string, Load>();
  tasks.forEach((t) => {
    const name = t.assignedWorker?.name;
    if (!name) return;
    const l = loads.get(name) ?? { worked: 0, planned: 0, open: 0 };
    if (!finished.includes(t.status)) l.open += 1;
    if (dayKey(t.scheduledDate) === todayKey) {
      const est = t.estimatedMinutes ?? 0;
      if (t.startedAt) {
        const end = t.completedAt ? new Date(t.completedAt).getTime() : now.getTime();
        const mins = Math.max(0, (end - new Date(t.startedAt).getTime()) / 60000);
        l.worked += mins;
        if (!t.completedAt) l.planned += Math.max(0, est - mins);
      } else if (!finished.includes(t.status)) {
        l.planned += est;
      }
    }
    loads.set(name, l);
  });
  const loadRows = Array.from(loads.entries())
    .filter(([, l]) => l.open > 0 || l.worked > 0 || l.planned > 0)
    .sort((a, b) => b[1].worked + b[1].planned - (a[1].worked + a[1].planned) || cmpText(a[0], b[0]));
  const scale = Math.max(480, ...loadRows.map(([, l]) => l.worked + l.planned)); // a full bar = 8 hours
  const hours = (m: number) => `${(m / 60).toFixed(1)} h`;

  const houseOpts = houses.map((h) => ({ id: h.id, name: h.mode === "TOURISM" ? `${h.name} · ${ev("TOURISM")}` : h.name }));

  return (
    <PanelShell title={tr("Operations Overview")} vis={vis} labels={SECTION_LABEL} wide>
      {shown.stats && (
        <StatGrid>
          <StatCard n={activeHouses} label={tr("Houses with activity")} />
          <StatCard n={urgent} label={tr("Urgent problems")} color="#C1503C" />
          <StatCard n={completedToday} label={tr("Completed today")} color="#4F7A26" />
          <StatCard n={overdue} label={tr("Overdue work")} color="#D98A33" />
          <StatCard n={openTasks} label={tr("Open tasks")} />
          <StatCard n={pending.length} label={tr("Pending material requests")} color={pending.length ? "#D98A33" : undefined} />
          <StatCard n={houses.filter((h) => h.keyStatus === "MISSING").length} label={tr("Keys missing")} color="#C1503C" />
        </StatGrid>
      )}

      <MaintenanceReview tickets={tickets} onChanged={load} />

      {/* Two independent stacks instead of one row-based grid: each card sits directly
          under the previous one in its own column, so a tall card (tickets) can never
          push a card in the next row down and leave empty space. On narrow screens the
          stacks wrap into a single column (tickets → workload → materials → keys). */}
      <div className="panel-masonry">
       {(shown.tickets || shown.workload) && (
        <div className="panel-stack">
        {/* ---- maintenance tickets ---- */}
        {shown.tickets && (
          <PanelCard title={tr("Open maintenance tickets")} action={<button style={S.smallDark} onClick={() => setTicketEd({ ticket: null })}>+ {tr("Report an Issue")}</button>}>
            <TicketSortBar value={ticketSort} onChange={setTicketSort} />
            {openTickets.map((t) => (
              <div key={t.id} style={row}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
                  <PriorityDot p={t.priority} />
                  <b style={{ flex: 1, minWidth: 0 }}>{t.house.name}</b>
                  <StatusBadge status={t.status} />
                </div>
                <div style={sub}>{tr(t.area)} — {tr(t.description)}</div>
                {t.photoUrl && <PhotoStrip photos={[t.photoUrl]} size={44} />}
                {t.status === "TO_BE_VERIFIED" && (
                  <div style={sub}>
                    {tr("Maintenance finished this ticket — please check the work.")}
                    {(t.timeSpentMinutes || t.materialsUsed) ? ` ${t.timeSpentMinutes ? t.timeSpentMinutes + " min" : ""}${t.materialsUsed ? " · " + t.materialsUsed : ""}` : ""}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  {t.status === "TO_BE_VERIFIED" ? (
                    <>
                      <button style={S.smallDark} onClick={() => ticketStatus(t.id, "confirm")}>✓ {tr("Confirm fixed")}</button>
                      <button style={S.small} onClick={() => ticketStatus(t.id, "sendBack")}>{tr("Send back")}</button>
                      <button style={S.small} onClick={() => setTicketEd({ ticket: t })}>{tr("Review")}</button>
                    </>
                  ) : (
                    <>
                      <button style={S.small} onClick={() => setTicketEd({ ticket: t })}>{tr("Edit")}</button>
                      <button style={S.small} onClick={() => ticketStatus(t.id, "reject")}>{tr("Reject")}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {openTickets.length === 0 && <p style={empty}>{tr("None right now.")}</p>}
          </PanelCard>
        )}

        {/* ---- rejected tickets: kept visible so a rejection never just vanishes ---- */}
        {shown.tickets && rejectedTickets.length > 0 && (
          <PanelCard title={tr("Rejected tickets")}>
            {rejectedTickets.map((t) => (
              <div key={t.id} style={row}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
                  <PriorityDot p={t.priority} />
                  <b style={{ flex: 1, minWidth: 0 }}>{t.house.name}</b>
                  <StatusBadge status={t.status} />
                </div>
                <div style={sub}>{tr(t.area)} — {tr(t.description)}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button style={S.smallDark} onClick={() => ticketStatus(t.id, "reopen")}>{tr("Reopen")}</button>
                  <button style={S.small} onClick={() => setTicketEd({ ticket: t })}>{tr("Edit")}</button>
                </div>
              </div>
            ))}
          </PanelCard>
        )}

        {/* ---- workload ---- */}
        {shown.workload && (
          <PanelCard title={tr("Workload today (hours)")}>
            {loadRows.length > 0 && (
              <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                <span><span style={{ ...dot, background: "var(--green-dark)" }} /> {tr("worked")}</span>
                <span><span style={{ ...dot, background: "#C9DDB0" }} /> {tr("planned")}</span>
              </div>
            )}
            {loadRows.map(([name, l]) => (
              <div key={name} style={row}>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span>{name}</span>
                  <span style={{ fontWeight: 700 }}>{hours(l.worked)} {tr("worked")}</span>
                </div>
                <div style={{ display: "flex", width: "100%", height: 10, borderRadius: 6, background: "#EEE", overflow: "hidden" }}>
                  <div style={{ width: `${(l.worked / scale) * 100}%`, background: "var(--green-dark)" }} />
                  <div style={{ width: `${(l.planned / scale) * 100}%`, background: "#C9DDB0" }} />
                </div>
                <div style={sub}>{hours(l.planned)} {tr("planned")} · {l.open} {tr("open")}</div>
              </div>
            ))}
            {loadRows.length === 0 && <p style={empty}>{tr("No assignments yet.")}</p>}
          </PanelCard>
        )}
        </div>
       )}

       {(shown.materials || shown.keys) && (
        <div className="panel-stack">

        {/* ---- material requests ---- */}
        {shown.materials && (
          <PanelCard title={tr("Pending material requests")} action={<button style={S.smallDark} onClick={() => setMatEd({ request: null })}>+ {tr("New request")}</button>}>
            {pending.map((m) => (
              <div key={m.id} style={row}>
                <b>{m.house.name}</b>
                <div style={sub}>{tr("{items} — requested by {name}", { items: tr(m.items), name: m.requestedBy.name })}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button style={S.small} onClick={() => setMatEd({ request: m })}>{tr("Edit")}</button>
                  <button style={S.smallDark} onClick={() => materialAction(m.id, "fulfill")}>{tr("Mark fulfilled")}</button>
                </div>
              </div>
            ))}
            {pending.length === 0 && <p style={empty}>{tr("Nothing pending.")}</p>}
            {recentDone.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", margin: "12px 0 6px" }}>{tr("Fulfilled")}</div>
                {recentDone.map((m) => (
                  <div key={m.id} style={{ ...row, opacity: 0.7 }}>
                    <b>{m.house.name}</b>
                    <div style={sub}>{tr(m.items)}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <button style={S.small} onClick={() => setMatEd({ request: m })}>{tr("Edit")}</button>
                      <button style={S.small} onClick={() => materialAction(m.id, "reopen")}>{tr("Reopen")}</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </PanelCard>
        )}

        {/* ---- houses & keys ---- */}
        {shown.keys && (
          <PanelCard title={tr("Key status")} action={canCreateHouse ? <button style={S.smallDark} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button> : undefined}>
            {sortedHouses.map((h) => (
              <div key={h.id} style={{ ...row, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{h.name}</span>
                <select value={h.keyStatus} onChange={(e) => setKey(h.id, e.target.value)}
                  style={{ ...S.input, width: "auto", padding: "4px 6px", fontSize: 11, fontWeight: 600, background: keyBg[h.keyStatus] ?? "#fff" }}>
                  {KEY_STATES.map((k) => <option key={k} value={k}>{ev(k)}</option>)}
                </select>
                {canEditHouse && <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>}
              </div>
            ))}
            {houses.length === 0 && <p style={empty}>{tr("No houses yet.")}</p>}
          </PanelCard>
        )}
        </div>
       )}

      </div>

      {ticketEd && <TicketEditor ticket={ticketEd.ticket} houses={houseOpts} workers={workers} onClose={() => setTicketEd(null)} onSaved={saved} />}
      {matEd && <MaterialEditor request={matEd.request} houses={houseOpts} onClose={() => setMatEd(null)} onSaved={saved} />}
      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={saved} />}
    </PanelShell>
  );
}

const keyBg: Record<string, string> = { AT_OFFICE: "var(--green-bg)", WITH_CLEANER: "#FAF3D6", WITH_GUEST: "#E6F0F8", MISSING: "var(--red-bg)" };
const row: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, fontSize: 12.5, padding: "8px 10px", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6 };
const dot: React.CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 4 };
const sub: React.CSSProperties = { fontSize: 11, color: "var(--ink-soft)" };
const empty: React.CSSProperties = { fontSize: 12, color: "var(--ink-soft)", margin: 0 };
