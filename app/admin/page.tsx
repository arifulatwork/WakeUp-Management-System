"use client";

import PanelShell, { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { useSectionVisibility } from "@/lib/useSectionVisibility";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { renderAudit } from "@/lib/auditText";
import { useI18n, Lang } from "@/lib/i18n";
import { MATRIX, ROLE_COLUMNS } from "@/lib/permissions";
import { S, SortTh, useSort } from "@/components/ui";
import { applyDir, AREA_RANK, cmpText, KEY_RANK, ROLE_RANK } from "@/lib/sort";
import StaffEditor, { EdStaff } from "@/components/editors/StaffEditor";
import { ModeBadge, CheckInGuideButton } from "@/components/CheckInGuide";
import HouseEditor, { EdHouseFull } from "@/components/editors/HouseEditor";

type Worker = {
  id: string;
  name: string;
  area: string;
  role: string;
  username: string | null;
  createdAt: string;
};

const ROLES = ["worker", "manager", "coordinator", "admin"];
const ROLE_LABEL: Record<string, string> = {
  worker: "Staff (cleaner/maintenance)",
  manager: "Manager",
  coordinator: "Coordinator",
  admin: "Super Admin",
};

// Sections the admin can show or hide. Remembered in this browser.
const SECTIONS = ["stats", "staff", "houses", "history", "roles"] as const;
const SECTION_LABEL: Record<(typeof SECTIONS)[number], string> = {
  stats: "Overview",
  staff: "Staff",
  houses: "Houses",
  history: "Change history",
  roles: "Role permissions",
};

export default function StaffAndRoles() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [credsFor, setCredsFor] = useState<Worker | null>(null);
  const [houses, setHouses] = useState<EdHouseFull[]>([]);
  const [staffEd, setStaffEd] = useState<{ worker: EdStaff | null } | null>(null);
  const staffSort = useSort<"name" | "team" | "joined" | "role">("role");
  const houseSort = useSort<"name" | "address" | "key" | "until">("name");
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [credError, setCredError] = useState("");
  const [me, setMe] = useState<{ name: string; workerId?: string } | null>(null);
  const { tr, ev, locale, setLang } = useI18n();
  const vis = useSectionVisibility("adminSections", SECTIONS);
  const shown = vis.shown;
  const [history, setHistory] = useState<{ id: string; actorName: string; actorRole: string; summary: string; template?: string | null; params?: Record<string, string | number> | null; createdAt: string }[]>([]);
  const loadHistory = () => fetch("/api/audit?limit=100").then((r) => (r.ok ? r.json() : [])).then(setHistory);
  useLiveRefresh(() => load(), { models: ["worker", "house"] });
  useLiveRefresh(loadHistory, { models: ["auditLog"] });

  useEffect(() => {
    load();
    loadHistory();
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then(setMe);
  }, []);

  async function load() {
    fetch("/api/houses").then((r) => r.json()).then(setHouses);
    const res = await fetch("/api/workers");
    setWorkers(await res.json());
  }

  async function changeRole(w: Worker, role: string) {
    setSavingId(w.id);
    await fetch(`/api/workers/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
    setSavingId(null);
    // Everyone signs in. Doesn't have credentials yet? Prompt right away.
    if (!w.username) {
      setCredsFor({ ...w, role });
      setUsername(w.name.toLowerCase().replace(/\s+/g, "."));
    }
  }

  async function saveCredentials() {
    if (!credsFor) return;
    setCredError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: credsFor.id, username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCredError(data.error ?? tr("Could not save credentials."));
      return;
    }
    setCredsFor(null);
    setUsername("");
    setPassword("");
    load();
  }

  // Super Admin support tool: step into a field worker's phone screen (e.g. to see
  // what a cleaner sees, or to try the app as them in a demo).
  function openApp(w: Worker) {
    setLang(((w as any).language ?? "en") as Lang, { persist: false });
    localStorage.setItem("workerId", w.id);
    localStorage.setItem("workerName", w.name);
    localStorage.setItem("workerArea", w.area);
    window.location.href = w.area === "CLEANING" ? "/cleaner" : "/maintenance";
  }

  // Staff default: admins, managers, coordinators, then field staff — A–Z inside each.
  const sortedWorkers = [...workers].sort((a, b) => {
    const tie = cmpText(a.name, b.name);
    let c = 0;
    if (staffSort.key === "name") c = cmpText(a.name, b.name);
    if (staffSort.key === "team") c = AREA_RANK[a.area] - AREA_RANK[b.area];
    if (staffSort.key === "joined") c = +new Date(a.createdAt) - +new Date(b.createdAt);
    if (staffSort.key === "role") c = ROLE_RANK[a.role] - ROLE_RANK[b.role];
    return applyDir(c, staffSort.dir) || tie;
  });
  const sortedHouses = [...houses].sort((a, b) => {
    const tie = cmpText(a.name, b.name);
    if (houseSort.key === "until") {
      // houses with no end date (permanent) always last
      if (!a.validUntil !== !b.validUntil) return a.validUntil ? -1 : 1;
      return applyDir(+new Date(a.validUntil ?? 0) - +new Date(b.validUntil ?? 0), houseSort.dir) || tie;
    }
    let c = 0;
    if (houseSort.key === "name") c = cmpText(a.name, b.name);
    if (houseSort.key === "address") c = cmpText(a.address, b.address);
    if (houseSort.key === "key") c = KEY_RANK[a.keyStatus] - KEY_RANK[b.keyStatus];
    return applyDir(c, houseSort.dir) || tie;
  });

  const withLogin = workers.filter((w) => w.username).length;
  const temporary = houses.filter((h) => h.validFrom || h.validUntil).length;

  return (
    <PanelShell
      title={tr("Staff & Roles")}
      subtitle={tr("Change anyone's role anytime. Everyone signs in with their own username and password; add people with Add staff.")}
      vis={vis}
      labels={SECTION_LABEL}
    >
      {shown.stats && (
        <StatGrid>
          <StatCard n={workers.length} label={tr("Staff members")} />
          <StatCard n={withLogin} label={tr("Logins set up")} color="#4F7A26" />
          <StatCard n={houses.length} label={tr("Houses")} />
          <StatCard n={temporary} label={tr("Temporary houses")} color="#D98A33" />
        </StatGrid>
      )}

      {shown.staff && (
        <PanelCard
          title={tr("Staff")}
          action={<button style={S.navDark} onClick={() => setStaffEd({ worker: null })}>+ {tr("Add staff")}</button>}
          flush
        >
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 }}>
            <thead>
              <tr>
                <SortTh label={tr("Name")} k="name" sort={staffSort} style={th} />
                <SortTh label={tr("Team")} k="team" sort={staffSort} style={th} />
                <SortTh label={tr("Joined")} k="joined" sort={staffSort} style={th} />
                <SortTh label={tr("Role")} k="role" sort={staffSort} style={th} />
                <th style={th}>{tr("Login")}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {sortedWorkers.map((w) => (
                <tr key={w.id}>
                  <td style={td}>{w.name}</td>
                  <td style={td}>{ev(w.area)}</td>
                  <td style={td}>{new Date(w.createdAt).toLocaleDateString(locale)}</td>
                  <td style={td}>
                    <select
                      value={w.role}
                      disabled={savingId === w.id || w.id === me?.workerId}
                      title={w.id === me?.workerId ? tr("You can't change your own role.") : undefined}
                      onChange={(e) => changeRole(w, e.target.value)}
                      style={select}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ev(r)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    {w.username ? (
                      <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                        {w.username}{" "}
                        <button style={{ ...S.small, marginLeft: 4 }} onClick={() => { setCredsFor(w); setUsername(w.username ?? ""); setPassword(""); }}>
                          {tr("Change password")}
                        </button>
                      </span>
                    ) : (
                      <button
                        style={smallBtn}
                        onClick={() => { setCredsFor(w); setUsername(w.name.toLowerCase().replace(/\s+/g, ".")); }}
                      >
                        {tr("Set up login")}
                      </button>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {w.role === "worker" && (
                      <button style={{ ...S.small, marginRight: 6 }} onClick={() => openApp(w)}>{tr("Open app")}</button>
                    )}
                    <button style={S.small} onClick={() => setStaffEd({ worker: w as EdStaff })}>{tr("Edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workers.length === 0 && <p style={{ color: "var(--ink-soft)", padding: 16, margin: 0 }}>{tr("No staff onboarded yet.")}</p>}
        </PanelCard>
      )}

      {shown.houses && (
        <PanelCard
          title={tr("Houses")}
          action={<button style={S.navDark} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button>}
          flush
        >
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 }}>
            <thead>
              <tr>
                <SortTh label={tr("Name")} k="name" sort={houseSort} style={th} />
                <SortTh label={tr("Address")} k="address" sort={houseSort} style={th} />
                <SortTh label={tr("Key status")} k="key" sort={houseSort} style={th} />
                <SortTh label={tr("Valid until")} k="until" sort={houseSort} style={th} />
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {sortedHouses.map((h) => (
                <tr key={h.id}>
                  <td style={td}>{h.name}<ModeBadge mode={h.mode} /></td>
                  <td style={{ ...td, color: "var(--ink-soft)" }}>{h.address}</td>
                  <td style={td}>{ev(h.keyStatus)}</td>
                  <td style={td}>{h.validUntil ? new Date(h.validUntil).toLocaleDateString(locale) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <CheckInGuideButton house={h} />{" "}
                    <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelCard>
      )}

      {shown.history && (
        <PanelCard
          title={tr("Change history")}
          subtitle={tr("Who changed what, and when.")}
          action={<button style={S.small} onClick={loadHistory}>{tr("Refresh")}</button>}
          flush
        >
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 12.5 }}>
              <thead>
                <tr><th style={th}>{tr("When")}</th><th style={th}>{tr("Who")}</th><th style={th}>{tr("What")}</th></tr>
              </thead>
              <tbody>
                {history.length === 0 && <tr><td style={td} colSpan={3}>{tr("No changes recorded yet.")}</td></tr>}
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(h.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</td>
                    <td style={td}>{h.actorName} <span style={{ color: "var(--ink-soft)" }}>· {h.actorRole === "worker" ? tr("Staff") : h.actorRole === "system" ? tr("System") : ev(h.actorRole)}</span></td>
                    <td style={td}>{renderAudit(h, tr, ev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      )}

      {shown.roles && (
        <PanelCard title={tr("What each role can do")} flush>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={th}>{tr("Capability")}</th>
                {ROLE_COLUMNS.map((r) => (
                  <th key={r} style={{ ...th, textAlign: "center" }}>{r === "worker" ? tr("Staff") : ev(r)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.label}>
                  <td style={td}>{tr(row.label)}</td>
                  {ROLE_COLUMNS.map((r) => (
                    <td key={r} style={{ ...td, textAlign: "center", color: row.roles.includes(r) ? "#4F7A26" : "var(--line)", fontWeight: 700 }}>
                      {row.roles.includes(r) ? "✓" : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </PanelCard>
      )}

      {staffEd && <StaffEditor worker={staffEd.worker} selfId={me?.workerId} onClose={() => setStaffEd(null)} onSaved={() => { setStaffEd(null); load(); }} />}
      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={() => { setHouseEd(null); load(); }} />}

      {credsFor && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginTop: 0, fontSize: 15 }}>{tr("Set login for {name}", { name: credsFor.name })}</h3>
            <label style={label}>{tr("Username")}</label>
            <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} />
            <label style={{ ...label, marginTop: 10 }}>{tr("Password (min 8 characters)")}</label>
            <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {credError && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{credError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={ghostBtn} onClick={() => setCredsFor(null)}>{tr("Cancel")}</button>
              <button style={primaryBtn} onClick={saveCredentials} disabled={!username || password.length < 8}>
                {tr("Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)" };
const select: React.CSSProperties = { fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff" };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: "4px 9px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff", cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 340 };
const label: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 };
const primaryBtn: React.CSSProperties = { flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--ink)", color: "#fff", fontSize: 13, fontWeight: 600 };
const ghostBtn: React.CSSProperties = { flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", fontSize: 13 };
