"use client";

import Logo from "@/components/Logo";
import { useEffect, useState, useCallback } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useCan } from "@/lib/useSession";
import { S, StatusBadge, PriorityDot, TicketSortBar } from "@/components/ui";
import { PhotoStrip } from "@/components/Photos";
import { cmpText, KEY_RANK, sortTickets, TicketSort } from "@/lib/sort";
import TicketEditor, { EdTicket } from "@/components/editors/TicketEditor";
import HouseEditor, { EdHouseFull } from "@/components/editors/HouseEditor";
import MaterialEditor, { EdMaterial } from "@/components/editors/MaterialEditor";
import { EdWorker } from "@/components/editors/TaskEditor";

type Task = { id: string; status: string; scheduledDate: string; assignedWorker: { name: string } | null; house: { name: string } };
type Ticket = EdTicket & { house: { id: string; name: string }; reportedBy: { name: string } };
type MaterialReq = EdMaterial & { fulfilledAt?: string | null; house: { id: string; name: string }; requestedBy: { name: string }; createdAt: string };

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

  const [ticketEd, setTicketEd] = useState<{ ticket: Ticket | null } | null>(null);
  const [matEd, setMatEd] = useState<{ request: MaterialReq | null } | null>(null);
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);

  const load = useCallback(async () => {
    const [tRes, kRes, mRes, hRes, wRes] = await Promise.all([
      fetch("/api/tasks"), fetch("/api/tickets"), fetch("/api/materials"), fetch("/api/houses"), fetch("/api/workers"),
    ]);
    setTasks(await tRes.json());
    setTickets(await kRes.json());
    setMaterials(await mRes.json());
    setHouses(await hRes.json());
    setWorkers(await wRes.json());
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
  const urgent = openTickets.filter((t) => t.priority === "RED").length;
  const overdue = tasks.filter((t) => new Date(t.scheduledDate) < new Date() && !finished.includes(t.status)).length;
  // Requests: whoever has waited longest is first; "fulfilled" shows the latest few.
  const pending = materials.filter((m) => m.status === "PENDING").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const recentDone = materials
    .filter((m) => m.status === "FULFILLED")
    .sort((a, b) => +new Date(b.fulfilledAt ?? b.createdAt) - +new Date(a.fulfilledAt ?? a.createdAt))
    .slice(0, 3);
  // Keys: anything unusual (missing, out with someone) before keys sitting at the office.
  const sortedHouses = [...houses].sort((a, b) => KEY_RANK[a.keyStatus] - KEY_RANK[b.keyStatus] || cmpText(a.name, b.name));

  const workload = new Map<string, number>();
  tasks.forEach((t) => {
    if (!t.assignedWorker || finished.includes(t.status)) return;
    workload.set(t.assignedWorker.name, (workload.get(t.assignedWorker.name) ?? 0) + 1);
  });

  const houseOpts = houses.map((h) => ({ id: h.id, name: h.name }));

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <Logo height={30} style={{ marginBottom: 10 }} />
          <h1 style={{ fontSize: 18, margin: 0 }}>{tr("Operations Overview")}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/manager" style={S.nav}>{tr("Cleaning Tasks — Live")}</a>
          <a href="/coordinator" style={S.nav}>{tr("Check-in Readiness")}</a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat n={tasks.length} label={tr("Houses with activity")} />
        <Stat n={urgent} label={tr("Urgent problems")} color="#C1503C" />
        <Stat n={completedToday} label={tr("Completed today")} color="#4F7A26" />
        <Stat n={overdue} label={tr("Overdue work")} color="#D98A33" />
        <Stat n={openTasks} label={tr("Open tasks")} />
        <Stat n={pending.length} label={tr("Pending material requests")} color={pending.length ? "#D98A33" : undefined} />
        <Stat n={houses.filter((h) => h.keyStatus === "MISSING").length} label={tr("Keys missing")} color="#C1503C" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20 }}>
        {/* ---- maintenance tickets ---- */}
        <section>
          <Head title={tr("Open maintenance tickets")} action={<button style={S.smallDark} onClick={() => setTicketEd({ ticket: null })}>+ {tr("Report an Issue")}</button>} />
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
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button style={S.small} onClick={() => setTicketEd({ ticket: t })}>{tr("Edit")}</button>
                <button style={S.small} onClick={() => ticketStatus(t.id, "reject")}>{tr("Reject")}</button>
              </div>
            </div>
          ))}
          {openTickets.length === 0 && <p style={empty}>{tr("None right now.")}</p>}
        </section>

        {/* ---- material requests ---- */}
        <section>
          <Head title={tr("Pending material requests")} action={<button style={S.smallDark} onClick={() => setMatEd({ request: null })}>+ {tr("New request")}</button>} />
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
        </section>

        {/* ---- houses & keys ---- */}
        <section>
          <Head title={tr("Key status")} action={canCreateHouse ? <button style={S.smallDark} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button> : undefined} />
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
        </section>

        {/* ---- workload ---- */}
        <section>
          <Head title={tr("Staff workload (open tasks)")} />
          {Array.from(workload.entries()).sort((a, b) => b[1] - a[1] || cmpText(a[0], b[0])).map(([name, n]) => (
            <div key={name} style={{ ...row, flexDirection: "row", justifyContent: "space-between" }}>
              <span>{name}</span>
              <span style={{ fontWeight: 700 }}>{n}</span>
            </div>
          ))}
          {workload.size === 0 && <p style={empty}>{tr("No assignments yet.")}</p>}
        </section>
      </div>

      {ticketEd && <TicketEditor ticket={ticketEd.ticket} houses={houseOpts} workers={workers} onClose={() => setTicketEd(null)} onSaved={saved} />}
      {matEd && <MaterialEditor request={matEd.request} houses={houseOpts} onClose={() => setMatEd(null)} onSaved={saved} />}
      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={saved} />}
    </main>
  );
}

function Head({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
      <h2 style={{ fontSize: 13, margin: 0 }}>{title}</h2>
      {action}
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", background: "#fff", minWidth: 128 }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: color ?? "var(--ink)" }}>{n}</div>
      <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{label}</div>
    </div>
  );
}

const keyBg: Record<string, string> = { AT_OFFICE: "var(--green-bg)", WITH_CLEANER: "#FAF3D6", WITH_GUEST: "#E6F0F8", MISSING: "var(--red-bg)" };
const row: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, fontSize: 12.5, padding: "8px 10px", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6 };
const sub: React.CSSProperties = { fontSize: 11, color: "var(--ink-soft)" };
const empty: React.CSSProperties = { fontSize: 12, color: "var(--ink-soft)" };
