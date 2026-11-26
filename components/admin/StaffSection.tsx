"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import { Modal, Pills, S, SortTh, useSort } from "@/components/ui";
import { api, saveError } from "@/lib/api";
import { useI18n, Lang } from "@/lib/i18n";
import { applyDir, AREA_RANK, cmpText, ROLE_RANK } from "@/lib/sort";
import type { EdStaff } from "@/components/editors/StaffEditor";
import { EmptyNote, LoadError, SearchBox, SkeletonRows, Toolbar, td, th, tableStyle, useApiList, useToast } from "./shared";

// The editor is only downloaded the first time someone clicks Add / Edit.
const StaffEditor = dynamic(() => import("@/components/editors/StaffEditor"), { ssr: false });

type Worker = { id: string; name: string; area: string; role: string; username: string | null; createdAt: string; language?: string };

const ROLES = ["worker", "manager", "coordinator", "admin", "supplier"];

export default function StaffSection({ selfId }: { selfId?: string }) {
  const { tr, ev, locale, setLang } = useI18n();
  const { data, error, reload, mutate } = useApiList<Worker[]>("/api/workers", ["worker"]);
  const toast = useToast();
  const [flashId, setFlashId] = useState<string | null>(null);
  const workers = data ?? [];

  const sort = useSort<"name" | "team" | "joined" | "role">("role");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | a role | nologin
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmAdmin, setConfirmAdmin] = useState<Worker | null>(null);
  const [staffEd, setStaffEd] = useState<{ worker: EdStaff | null } | null>(null);

  // login dialog
  const [credsFor, setCredsFor] = useState<Worker | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSaving, setCredSaving] = useState(false);

  const withLogin = workers.filter((w) => w.username).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers
      .filter((w) => (filter === "all" ? true : filter === "nologin" ? !w.username : w.role === filter))
      .filter((w) => !q || w.name.toLowerCase().includes(q) || (w.username ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const tie = cmpText(a.name, b.name);
        let c = 0;
        if (sort.key === "name") c = cmpText(a.name, b.name);
        if (sort.key === "team") c = AREA_RANK[a.area] - AREA_RANK[b.area];
        if (sort.key === "joined") c = +new Date(a.createdAt) - +new Date(b.createdAt);
        if (sort.key === "role") c = ROLE_RANK[a.role] - ROLE_RANK[b.role];
        return applyDir(c, sort.dir) || tie;
      });
  }, [workers, query, filter, sort.key, sort.dir]);

  function openCreds(w: Worker) {
    setCredsFor(w);
    setUsername(w.username ?? w.name.toLowerCase().replace(/\s+/g, "."));
    setPassword("");
    setShowPw(false);
    setCredError("");
  }

  // The new role shows on screen at once; if the server refuses, it goes back and an error message appears.
  async function applyRole(w: Worker, role: string) {
    const setRole = (r: string) => mutate((list) => (list ? list.map((x) => (x.id === w.id ? { ...x, role: r } : x)) : list));
    setSavingId(w.id);
    setRole(role);
    setFlashId(w.id);
    setTimeout(() => setFlashId((cur) => (cur === w.id ? null : cur)), 1800);
    try {
      await api(`/api/workers/${w.id}`, "PATCH", { role });
      toast.show(tr("{name} is now {role}.", { name: w.name, role: role === "worker" ? tr("Staff") : ev(role) }));
      reload(); // confirm with the server in the background
      // Everyone signs in. No credentials yet? Ask for them right away.
      if (!w.username) openCreds({ ...w, role });
    } catch (e) {
      setRole(w.role);
      toast.show(saveError(e, tr), false);
    } finally {
      setSavingId(null);
    }
  }

  // Making someone Super Admin is the one change worth a second look.
  function requestRole(w: Worker, role: string) {
    if (role === w.role) return;
    if (role === "admin") setConfirmAdmin(w);
    else applyRole(w, role);
  }

  async function saveCredentials() {
    if (!credsFor) return;
    setCredError("");
    setCredSaving(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: credsFor.id, username, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCredError(d.error ?? tr("Could not save credentials."));
        return;
      }
      toast.show(tr("Login saved for {name}.", { name: credsFor.name }));
      setCredsFor(null);
      reload();
    } finally {
      setCredSaving(false);
    }
  }

  // Super Admin support tool: step into a field worker's phone screen.
  function openApp(w: Worker) {
    setLang((w.language ?? "en") as Lang, { persist: false });
    localStorage.setItem("workerId", w.id);
    localStorage.setItem("workerName", w.name);
    localStorage.setItem("workerArea", w.area);
    window.location.href = w.area === "CLEANING" ? "/cleaner" : "/maintenance";
  }

  const filterOptions = ["all", ...ROLES, "nologin"];
  const filterLabel = (o: string) => (o === "all" ? tr("All roles") : o === "nologin" ? tr("Without login") : o === "worker" ? tr("Staff") : ev(o));

  return (
    <>
      <StatGrid>
        <StatCard n={data ? workers.length : "…"} label={tr("Staff members")} />
        <StatCard n={data ? withLogin : "…"} label={tr("Logins set up")} color="#4F7A26" />
        <StatCard n={data ? workers.length - withLogin : "…"} label={tr("Without login")} color={data && workers.length - withLogin > 0 ? "#D98A33" : undefined} />
      </StatGrid>

      <PanelCard
        title={tr("Staff")}
        action={<button style={S.navDark} onClick={() => setStaffEd({ worker: null })}>+ {tr("Add staff")}</button>}
        flush
      >
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder={tr("Search by name or username")} />
          <Pills options={filterOptions} value={filter} onChange={setFilter} label={filterLabel} />
        </Toolbar>

        {!data ? (
          error ? <LoadError onRetry={reload} /> : <SkeletonRows />
        ) : (
          <>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <SortTh label={tr("Name")} k="name" sort={sort} style={th} />
                  <SortTh label={tr("Team")} k="team" sort={sort} style={th} />
                  <SortTh label={tr("Joined")} k="joined" sort={sort} style={th} />
                  <SortTh label={tr("Role")} k="role" sort={sort} style={th} />
                  <th style={th}>{tr("Login")}</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const isMe = w.id === selfId;
                  return (
                    <tr key={w.id} style={flashId === w.id ? { background: "var(--green-bg)" } : undefined}>
                      <td style={td}>
                        {w.name}
                        {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-soft)" }}>({tr("You")})</span>}
                      </td>
                      <td style={td}>{ev(w.area)}</td>
                      <td style={td}>{new Date(w.createdAt).toLocaleDateString(locale)}</td>
                      <td style={td}>
                        <select
                          value={w.role}
                          disabled={savingId === w.id || isMe}
                          title={isMe ? tr("You can't change your own role.") : undefined}
                          aria-label={tr("Role")}
                          onChange={(e) => requestRole(w, e.target.value)}
                          style={selectStyle}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ev(r)}</option>)}
                        </select>
                        {savingId === w.id && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-soft)" }}>{tr("Saving…")}</span>}
                      </td>
                      <td style={td}>
                        {w.username ? (
                          <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                            {w.username}{" "}
                            <button style={{ ...S.small, marginLeft: 4 }} onClick={() => openCreds(w)}>{tr("Change password")}</button>
                          </span>
                        ) : (
                          <button style={warnBtn} onClick={() => openCreds(w)}>{tr("Set up login")}</button>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {w.role === "worker" && <button style={{ ...S.small, marginRight: 6 }} onClick={() => openApp(w)}>{tr("Open app")}</button>}
                        <button style={S.small} onClick={() => setStaffEd({ worker: w as EdStaff })}>{tr("Edit")}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {workers.length === 0 && <EmptyNote>{tr("No staff onboarded yet.")}</EmptyNote>}
            {workers.length > 0 && rows.length === 0 && <EmptyNote>{tr("No staff match your search.")}</EmptyNote>}
          </>
        )}
      </PanelCard>

      {staffEd && <StaffEditor worker={staffEd.worker} selfId={selfId} onClose={() => setStaffEd(null)} onSaved={() => { setStaffEd(null); toast.show(tr("Changes saved.")); reload(); }} />}

      {confirmAdmin && (
        <Modal title={tr("Role")} onClose={() => setConfirmAdmin(null)}>
          <p style={{ fontSize: 13.5, lineHeight: 1.45 }}>
            {tr("Make {name} a Super Admin? They will be able to change every role, login and setting.", { name: confirmAdmin.name })}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={S.ghost} onClick={() => setConfirmAdmin(null)}>{tr("Cancel")}</button>
            <button style={S.primary} onClick={() => { const w = confirmAdmin; setConfirmAdmin(null); applyRole(w, "admin"); }}>
              {tr("Yes, make Super Admin")}
            </button>
          </div>
        </Modal>
      )}

      {credsFor && (
        <Modal title={tr("Set login for {name}", { name: credsFor.name })} onClose={() => setCredsFor(null)}>
          <form onSubmit={(e) => { e.preventDefault(); if (username && password.length >= 8) saveCredentials(); }}>
            <label htmlFor="cred-user" style={S.label}>{tr("Username")}</label>
            <input id="cred-user" style={S.input} value={username} autoComplete="off" autoCapitalize="none" onChange={(e) => setUsername(e.target.value)} />
            <label htmlFor="cred-pw" style={S.label}>{tr("Password (min 8 characters)")}</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input id="cred-pw" style={S.input} type={showPw ? "text" : "password"} value={password} autoComplete="new-password" autoFocus onChange={(e) => setPassword(e.target.value)} />
              <button type="button" style={S.small} onClick={() => setShowPw(!showPw)}>{showPw ? tr("Hide password") : tr("Show password")}</button>
            </div>
            {credError && <p role="alert" style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{credError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" style={S.ghost} onClick={() => setCredsFor(null)}>{tr("Cancel")}</button>
              <button type="submit" style={{ ...S.primary, opacity: username && password.length >= 8 && !credSaving ? 1 : 0.5 }} disabled={!username || password.length < 8 || credSaving}>
                {credSaving ? tr("Saving…") : tr("Save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {toast.node}
    </>
  );
}

const selectStyle: React.CSSProperties = { fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff" };
const warnBtn: React.CSSProperties = { fontSize: 11, padding: "4px 9px", borderRadius: 7, border: "1px solid var(--orange)", background: "#FBEDDB", color: "#8a5416", cursor: "pointer" };
