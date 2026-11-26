"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import PanelShell, { PanelCard } from "@/components/PanelShell";
import PanelTabs, { useHashTab } from "@/components/PanelTabs";
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

export default function StaffAndRoles() {
  const { tr } = useI18n();
  const [tab, choose] = useHashTab<Tab>(TABS, "staff");
  const [selfId, setSelfId] = useState<string | undefined>();

  // Who am I? PanelShell already stored it for this browser tab, so usually no extra request.
  useEffect(() => {
    try {
      const c = sessionStorage.getItem("panelMe");
      if (c) { setSelfId(JSON.parse(c).workerId); return; }
    } catch {}
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((m) => m && setSelfId(m.workerId)).catch(() => {});
  }, []);

  return (
    <PanelShell
      title={tr("Staff & Roles")}
      subtitle={tr("Change anyone's role anytime. Everyone signs in with their own username and password; add people with Add staff.")}
    >
      <PanelTabs tabs={TABS.map((t) => ({ id: t, label: tr(TAB_LABEL[t]) }))} value={tab} onChange={choose} label={tr("Staff & Roles")} />

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
