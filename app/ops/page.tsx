"use client";

import dynamic from "next/dynamic";
import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
import { LoadError, SkeletonRows, useApiList } from "@/components/PanelKit";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useCan } from "@/lib/useSession";
import { Pills, S, StatusBadge, PriorityDot, TicketSortBar } from "@/components/ui";
import { ShowMore, norm } from "@/components/ordering/Pager";
import { PhotoStrip } from "@/components/Photos";
import { cmpText, dayKey, KEY_RANK, sortTickets, TicketSort } from "@/lib/sort";
import MaintenanceReview from "@/components/MaintenanceReview";
import type { EdTicket } from "@/components/editors/TicketEditor";
import type { EdHouseFull } from "@/components/editors/HouseEditor";
import type { EdMaterial } from "@/components/editors/MaterialEditor";
import type { EdWorker } from "@/components/editors/TaskEditor";

// The editors are only downloaded when somebody opens one.
const TicketEditor = dynamic(() => import("@/components/editors/TicketEditor"), { ssr: false });
const MaterialEditor = dynamic(() => import("@/components/editors/MaterialEditor"), { ssr: false });
const HouseEditor = dynamic(() => import("@/components/editors/HouseEditor"), { ssr: false });

type Task = {
  id: string; houseId: string; status: string; scheduledDate: string; scheduledTime: string;
  estimatedMinutes?: number | null; startedAt?: string | null; completedAt?: string | null;
  cleaningTypes?: string[]; nextCheckIn?: string | null;
  assignedWorker: { name: string } | null; house: { name: string };
};
type Ticket = EdTicket & { house: { id: string; name: string }; reportedBy: { name: string } };
type MaterialReq = EdMaterial & { fulfilledAt?: string | null; house: { id: string; name: string }; requestedBy: { name: string }; createdAt: string };

// One tab per section. Only the open tab loads its data (see NEEDS), so the screen no longer
// asks the server for every list at the same moment. The open tab is kept in the address (#keys).
const TABS = ["overview", "tickets", "materials", "keys", "workload"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview", tickets: "Tickets", materials: "Materials", keys: "Keys", workload: "Workload",
};

// The lists each tab needs, in the order they are fetched (one after the other, never all at once).
type Res = "tasks" | "tickets" | "materials" | "houses" | "workers";
const NEEDS: Record<Tab, Res[]> = {
  overview: ["tasks", "tickets", "materials", "houses"], // the number tiles
  tickets: ["tickets"],
  materials: ["materials"],
  keys: ["houses"],
  workload: ["tasks"],
};

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];
const KEY_FILTERS = ["ALL", ...KEY_STATES];
const LIST_STEP = 5;   // requests shown at first, and added by each "Show more"
const KEYS_STEP = 8;   // houses shown at first in the key list

// The single screen Manager / Ops check first each morning. Every list is
// editable: tickets, material requests, houses and key status.
export default function OpsOverview() {
  const { tr, ev } = useI18n();
  const canCreateHouse = useCan("houses.create");
  const canEditHouse = useCan("houses.edit");
  const [tab, chooseTab] = useHashTab<Tab>(TABS, "overview");
  const [ticketSort, setTicketSort] = useState<TicketSort>("priority");
  const [matQ, setMatQ] = useState("");
  const [matShown, setMatShown] = useState(LIST_STEP);
  const [keyF, setKeyF] = useState("ALL");
  const [keyQ, setKeyQ] = useState("");
  const [keyShown, setKeyShown] = useState(KEYS_STEP);
  useEffect(() => setMatShown(LIST_STEP), [matQ]);
  useEffect(() => setKeyShown(KEYS_STEP), [keyF, keyQ]);

  const [ticketEd, setTicketEd] = useState<{ ticket: Ticket | null } | null>(null);
  const [matEd, setMatEd] = useState<{ request: MaterialReq | null } | null>(null);
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);

  // ---- staged loading ----
  // `started` = lists whose request has been sent (it stays in the list, so a list is never fetched twice
  // just because the tab changed). The next list of the OPEN tab starts only when the one before it has
  // arrived (or failed). Lists of other tabs are not loaded until their tab is opened. The worker list
  // (and houses) are only needed by the pop-ups, so they load when a pop-up is opened.
  const [started, setStarted] = useState<Res[]>([]);
  const [ready, setReady] = useState(false);        // wait one beat so a #keys link doesn't start the Overview lists first
  const [wantLookups, setWantLookups] = useState(false);
  useEffect(() => setReady(true), []);
  const on = (r: Res) => started.includes(r);

  const tasksQ = useApiList<Task[]>(on("tasks") ? "/api/tasks" : null, ["cleaningTask", "house", "worker"]);
  // open + rejected tickets only: closed ones pile up over time and this screen never shows them
  const ticketsQ = useApiList<Ticket[]>(on("tickets") ? "/api/tickets?open=1&rejected=1" : null, ["maintenanceTicket", "house", "worker"]);
  const materialsQ = useApiList<MaterialReq[]>(on("materials") ? "/api/materials" : null, ["materialRequest", "house"]);
  const housesQ = useApiList<EdHouseFull[]>(on("houses") ? "/api/houses" : null, ["house"]);
  const workersQ = useApiList<EdWorker[]>(on("workers") ? "/api/workers" : null, ["worker"]);
  const tasks = tasksQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const materials = materialsQ.data ?? [];
  const houses = housesQ.data ?? [];
  const workers = workersQ.data ?? [];

  const settled = (q: { data: unknown; error: boolean }) => q.data !== null || q.error;
  const settledBy: Record<Res, boolean> = {
    tasks: settled(tasksQ), tickets: settled(ticketsQ), materials: settled(materialsQ), houses: settled(housesQ), workers: settled(workersQ),
  };
  const settledKey = (Object.keys(settledBy) as Res[]).map((r) => (settledBy[r] ? 1 : 0)).join("");
  useEffect(() => {
    if (!ready) return;
    const want: Res[] = [...NEEDS[tab]];
    if (wantLookups) (["houses", "workers"] as Res[]).forEach((r) => { if (!want.includes(r)) want.push(r); });
    const next = want.find((r) => !started.includes(r));
    if (!next) return;
    if (want.slice(0, want.indexOf(next)).every((r) => settledBy[r])) setStarted((s) => (s.includes(next) ? s : [...s, next]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ready, wantLookups, started, settledKey]);

  const lookupsReady = housesQ.data !== null && workersQ.data !== null;
  const openEditor = (open: () => void) => { setWantLookups(true); open(); };

  // After a change made here: reload the lists on screen. (Other people's changes arrive by themselves, live.)
  const load = () => { tasksQ.reload(); ticketsQ.reload(); materialsQ.reload(); housesQ.reload(); };

  const saved = () => { setTicketEd(null); setMatEd(null); setHouseEd(null); load(); };

  async function materialAction(id: string, action: "fulfill" | "reopen") {
    await api(`/api/materials/${id}`, "PATCH", { action });
    load();
  }
  async function setKey(id: string, keyStatus: string) {
    housesQ.mutate((hs) => (hs ? hs.map((h) => (h.id === id ? { ...h, keyStatus } : h)) : hs)); // optimistic
    await api(`/api/houses/${id}`, "PATCH", { keyStatus });
    load();
  }
  const [ticketErr, setTicketErr] = useState("");
  async function ticketStatus(id: string, action: string) {
    setTicketErr("");
    try {
      await api(`/api/tickets/${id}`, "PATCH", { action });
    } catch (e: any) {
      // A refused action (e.g. someone else just took the ticket) must never look like a dead button.
      setTicketErr(e?.status === 401 || e?.status === 403
        ? tr("You don't have permission to do this.")
        : tr("This ticket was changed by someone else. The list has been refreshed."));
    }
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
  // Daily turnover: guests leaving today (a check-out cleaning is planned today) and guests
  // arriving today (a job whose "next check-in" is today). One house counted once per kind.
  const checkOutsToday = new Set(tasks.filter((t) => dayKey(t.scheduledDate) === todayKey && (t.cleaningTypes ?? []).includes("CHECKOUT")).map((t) => t.houseId)).size;
  const checkInsTodayTasks = tasks.filter((t) => t.nextCheckIn && dayKey(t.nextCheckIn) === todayKey);
  const checkInsToday = new Set(checkInsTodayTasks.map((t) => t.houseId)).size;
  const checkInsReady = new Set(checkInsTodayTasks.filter((t) => t.status === "APPROVED").map((t) => t.houseId)).size;
  // Requests: whoever has waited longest is first; "fulfilled" shows the latest few.
  const pending = materials.filter((m) => m.status === "PENDING").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const recentDone = materials
    .filter((m) => m.status === "FULFILLED")
    .sort((a, b) => +new Date(b.fulfilledAt ?? b.createdAt) - +new Date(a.fulfilledAt ?? a.createdAt))
    .slice(0, 3);
  // Keys: anything unusual (missing, out with someone) before keys sitting at the office.
  const sortedHouses = [...houses].sort((a, b) => KEY_RANK[a.keyStatus] - KEY_RANK[b.keyStatus] || cmpText(a.name, b.name));

  // Search + paging for the two side lists (the queue itself stays in the same order).
  const matNeedle = norm(matQ.trim());
  const matHit = (m: MaterialReq) => !matNeedle || [m.house.name, m.items, tr(m.items), m.requestedBy.name].some((v) => norm(v).includes(matNeedle));
  const pendingMatching = pending.filter(matHit);
  const pendingShown = pendingMatching.slice(0, matShown);
  const recentShown = recentDone.filter(matHit);
  const keyNeedle = norm(keyQ.trim());
  const keysMatching = sortedHouses.filter((h) => (keyF === "ALL" || h.keyStatus === keyF) && (!keyNeedle || norm(h.name).includes(keyNeedle)));
  const keysShown = keysMatching.slice(0, keyShown);
  const keyCount = (f: string) => (f === "ALL" ? houses.length : houses.filter((h) => h.keyStatus === f).length);

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

  // A tile shows "…" until its list has arrived ("–" if it could not be loaded).
  const sv = (q: { data: unknown; error: boolean }, n: number) => (q.data !== null ? n : q.error ? "–" : "…");
  // Grey rows while a tab's list loads (or a retry button if it failed).
  const waiting = (q: { data: unknown; error: boolean; reload: () => void }, rows = 4) =>
    q.error && q.data === null ? <LoadError onRetry={q.reload} /> : <SkeletonRows rows={rows} />;
  const narrow: React.CSSProperties = { maxWidth: 860 };

  return (
    <PanelShell title={tr("Operations Overview")} wide>
      <PanelTabs
        tabs={TABS.map((t) => ({
          id: t,
          label: tr(TAB_LABEL[t]),
          badge: t === "tickets" ? tickets.filter((k) => k.status === "TO_BE_VERIFIED").length
            : t === "materials" ? pending.length : undefined,
        }))}
        value={tab}
        onChange={chooseTab}
        label={tr("Operations Overview")}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {ticketErr && (
        <div role="alert" style={{ background: "#FBEAE6", color: "#C1503C", padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 14 }}>
          {ticketErr}
        </div>
      )}

      {/* ---- Overview: the number tiles. Each one fills in as its own list arrives. ---- */}
      {tab === "overview" && (
        <StatGrid>
          <StatCard n={sv(tasksQ, activeHouses)} label={tr("Houses with activity")} />
          <StatCard n={sv(ticketsQ, urgent)} label={tr("Urgent problems")} color="#C1503C" />
          <StatCard n={sv(tasksQ, checkOutsToday)} label={tr("Check-outs today")} />
          <StatCard n={sv(tasksQ, checkInsToday)} label={tr("Check-ins today")} />
          <StatCard n={sv(tasksQ, checkInsReady)} label={tr("Check-ins ready")} color="#4F7A26" />
          <StatCard n={sv(tasksQ, completedToday)} label={tr("Completed today")} color="#4F7A26" />
          <StatCard n={sv(tasksQ, overdue)} label={tr("Overdue work")} color="#D98A33" />
          <StatCard n={sv(tasksQ, openTasks)} label={tr("Open tasks")} />
          <StatCard n={sv(materialsQ, pending.length)} label={tr("Pending material requests")} color={pending.length ? "#D98A33" : undefined} />
          <StatCard n={sv(housesQ, houses.filter((h) => h.keyStatus === "MISSING").length)} label={tr("Keys missing")} color="#C1503C" />
        </StatGrid>
      )}

      {/* ---- Tickets: maintenance work to review, open tickets, rejected tickets ---- */}
      {tab === "tickets" && (
        ticketsQ.data === null ? (
          <PanelCard title={tr("Open maintenance tickets")} flush>{waiting(ticketsQ)}</PanelCard>
        ) : (
          <>
          <MaintenanceReview tickets={tickets} onChanged={load} />
          <div style={narrow}>
          <PanelCard title={tr("Open maintenance tickets")} action={<button style={S.smallDark} onClick={() => openEditor(() => setTicketEd({ ticket: null }))}>+ {tr("Report an Issue")}</button>}>
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
                      <button style={S.small} onClick={() => openEditor(() => setTicketEd({ ticket: t }))}>{tr("Review")}</button>
                    </>
                  ) : (
                    <>
                      <button style={S.small} onClick={() => openEditor(() => setTicketEd({ ticket: t }))}>{tr("Edit")}</button>
                      {/* Reject only while nobody has taken it. Once accepted / started, the office takes it back with Reopen. */}
                      {t.status === "OPEN" ? (
                        <button style={S.small} onClick={() => ticketStatus(t.id, "reject")}>{tr("Reject")}</button>
                      ) : (
                        <button style={S.small} onClick={() => ticketStatus(t.id, "reopen")}>{tr("Reopen")}</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {openTickets.length === 0 && <p style={empty}>{tr("None right now.")}</p>}
          </PanelCard>

          {/* rejected tickets: kept visible so a rejection never just vanishes */}
          {rejectedTickets.length > 0 && (
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
                    <button style={S.small} onClick={() => openEditor(() => setTicketEd({ ticket: t }))}>{tr("Edit")}</button>
                  </div>
                </div>
              ))}
            </PanelCard>
          )}
          </div>
          </>
        )
      )}

      {/* ---- Materials ---- */}
      {tab === "materials" && (
        <div style={narrow}>
        <PanelCard title={tr("Pending material requests")} action={<button style={S.smallDark} onClick={() => openEditor(() => setMatEd({ request: null }))}>+ {tr("New request")}</button>}>
          {materialsQ.data === null ? waiting(materialsQ) : (
          <>
            {pending.length > LIST_STEP && (
              <input type="search" value={matQ} onChange={(e) => setMatQ(e.target.value)} maxLength={60} aria-label={tr("Search houses, items or people…")}
                placeholder={tr("Search houses, items or people…")} style={{ ...S.input, boxSizing: "border-box", marginBottom: 8 }} />
            )}
            {pendingShown.map((m) => (
              <div key={m.id} style={row}>
                <b>{m.house.name}</b>
                <div style={sub}>{tr("{items} — requested by {name}", { items: tr(m.items), name: m.requestedBy.name })}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button style={S.small} onClick={() => openEditor(() => setMatEd({ request: m }))}>{tr("Edit")}</button>
                  <button style={S.smallDark} onClick={() => materialAction(m.id, "fulfill")}>{tr("Mark fulfilled")}</button>
                </div>
              </div>
            ))}
            <ShowMore hidden={pendingMatching.length - pendingShown.length} total={pendingMatching.length} step={LIST_STEP}
              onMore={() => setMatShown(matShown + LIST_STEP)} onAll={() => setMatShown(pendingMatching.length)} />
            {pending.length === 0 && <p style={empty}>{tr("Nothing pending.")}</p>}
            {pending.length > 0 && pendingMatching.length === 0 && <p style={empty}>{tr("No matching requests.")}</p>}
            {recentShown.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", margin: "12px 0 6px" }}>{tr("Fulfilled")}</div>
                {recentShown.map((m) => (
                  <div key={m.id} style={{ ...row, opacity: 0.7 }}>
                    <b>{m.house.name}</b>
                    <div style={sub}>{tr(m.items)}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <button style={S.small} onClick={() => openEditor(() => setMatEd({ request: m }))}>{tr("Edit")}</button>
                      <button style={S.small} onClick={() => materialAction(m.id, "reopen")}>{tr("Reopen")}</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
          )}
        </PanelCard>
        </div>
      )}

      {/* ---- Keys (houses) ---- */}
      {tab === "keys" && (
        <div style={narrow}>
        <PanelCard title={tr("Key status")} action={canCreateHouse ? <button style={S.smallDark} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button> : undefined}>
          {housesQ.data === null ? waiting(housesQ) : (
          <>
            {houses.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Pills options={KEY_FILTERS} value={keyF} onChange={setKeyF} label={(k) => `${k === "ALL" ? tr("All") : ev(k)} (${keyCount(k)})`} />
                {houses.length > KEYS_STEP && (
                  <input type="search" value={keyQ} onChange={(e) => setKeyQ(e.target.value)} maxLength={60} aria-label={tr("Search houses…")}
                    placeholder={tr("Search houses…")} style={{ ...S.input, boxSizing: "border-box", marginTop: 8 }} />
                )}
              </div>
            )}
            {keysShown.map((h) => (
              <div key={h.id} style={{ ...row, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{h.name}</span>
                <select value={h.keyStatus} onChange={(e) => setKey(h.id, e.target.value)}
                  style={{ ...S.input, width: "auto", padding: "4px 6px", fontSize: 11, fontWeight: 600, background: keyBg[h.keyStatus] ?? "#fff" }}>
                  {KEY_STATES.map((k) => <option key={k} value={k}>{ev(k)}</option>)}
                </select>
                {canEditHouse && <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>}
              </div>
            ))}
            <ShowMore hidden={keysMatching.length - keysShown.length} total={keysMatching.length} step={KEYS_STEP}
              onMore={() => setKeyShown(keyShown + KEYS_STEP)} onAll={() => setKeyShown(keysMatching.length)} />
            {houses.length === 0 && <p style={empty}>{tr("No houses yet.")}</p>}
            {houses.length > 0 && keysMatching.length === 0 && <p style={empty}>{tr("No matching houses.")}</p>}
          </>
          )}
        </PanelCard>
        </div>
      )}

      {/* ---- Workload ---- */}
      {tab === "workload" && (
        <div style={narrow}>
        <PanelCard title={tr("Workload today (hours)")}>
          {tasksQ.data === null ? waiting(tasksQ) : (
          <>
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
          </>
          )}
        </PanelCard>
        </div>
      )}
      </div>

      {ticketEd && lookupsReady && <TicketEditor ticket={ticketEd.ticket} houses={houseOpts} workers={workers} onClose={() => setTicketEd(null)} onSaved={saved} />}
      {matEd && housesQ.data !== null && <MaterialEditor request={matEd.request} houses={houseOpts} onClose={() => setMatEd(null)} onSaved={saved} />}
      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={saved} />}
    </PanelShell>
  );
}

const keyBg: Record<string, string> = { AT_OFFICE: "var(--green-bg)", WITH_CLEANER: "#FAF3D6", WITH_GUEST: "#E6F0F8", MISSING: "var(--red-bg)" };
const row: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, fontSize: 12.5, padding: "8px 10px", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6 };
const dot: React.CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 4 };
const sub: React.CSSProperties = { fontSize: 11, color: "var(--ink-soft)" };
const empty: React.CSSProperties = { fontSize: 12, color: "var(--ink-soft)", margin: 0 };
