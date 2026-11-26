"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import PanelShell, { PanelCard } from "@/components/PanelShell";
import { useI18n } from "@/lib/i18n";
import StaffSection from "@/components/admin/StaffSection";
import { SkeletonRows } from "@/components/admin/shared";

// Staff & Roles is split into tabs. Only the open tab is on screen, so only its data is requested.
// Each tab's code and data load the first time it is opened; Staff (the default) loads right away.
const Loading = () => <PanelCard flush><SkeletonRows /></PanelCard>;
const HousesSection = dynamic(() => import("@/components/admin/HousesSection"), { loading: Loading });
const TaskSettings = dynamic(() => import("@/components/editors/TaskSettings"), { loading: Loading });
const HistorySection = dynamic(() => import("@/components/admin/HistorySection"), { loading: Loading });
const RolesSection = dynamic(() => import("@/components/admin/RolesSection"), { loading: Loading });

const TABS = ["staff", "houses", "settings", "history", "roles"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  staff: "Staff",
  houses: "Houses",
  settings: "Cleaning settings",
  history: "Change history",
  roles: "Role permissions",
};

const fromHash = (): Tab => {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : "staff";
};

export default function StaffAndRoles() {
  const { tr } = useI18n();
  const [tab, setTab] = useState<Tab>("staff");
  const [selfId, setSelfId] = useState<string | undefined>();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Remember the tab in the address (#houses): a reload or the Back button returns to it.
  useEffect(() => {
    setTab(fromHash());
    const onHash = () => setTab(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Who am I? PanelShell already stored it for this browser tab, so usually no extra request.
  useEffect(() => {
    try {
      const c = sessionStorage.getItem("panelMe");
      if (c) { setSelfId(JSON.parse(c).workerId); return; }
    } catch {}
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((m) => m && setSelfId(m.workerId)).catch(() => {});
  }, []);

  function choose(t: Tab) {
    setTab(t);
    history.replaceState(null, "", t === "staff" ? window.location.pathname : `#${t}`);
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    choose(t);
    tabRefs.current[t]?.focus();
  }

  return (
    <PanelShell
      title={tr("Staff & Roles")}
      subtitle={tr("Change anyone's role anytime. Everyone signs in with their own username and password; add people with Add staff.")}
    >
      <div className="admin-tabs" role="tablist" aria-label={tr("Staff & Roles")}>
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => { tabRefs.current[t] = el; }}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            className="admin-tab"
            onClick={() => choose(t)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {tr(TAB_LABEL[t])}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "staff" && <StaffSection selfId={selfId} />}
        {tab === "houses" && <HousesSection />}
        {tab === "settings" && <PanelCard title={tr("Cleaning settings")} flush><TaskSettings /></PanelCard>}
        {tab === "history" && <HistorySection />}
        {tab === "roles" && <RolesSection />}
      </div>
    </PanelShell>
  );
}
