"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { Pills, S } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { SCREENS, Role } from "@/lib/permissions";
import type { SectionVisibility } from "@/lib/useSectionVisibility";

// One look for every management screen: sidebar menu on the left, title bar on
// top, content in cards. Used by Admin, Manager, Coordinator and Ops.

type Me = { name: string; role: string; workerId?: string };

// The menu. Each person only sees the screens their role may open (SCREENS in lib/permissions.ts).
const NAV = [
  { href: "/admin", label: "Staff & Roles", icon: "👥" },
  { href: "/manager", label: "Cleaning Tasks — Live", icon: "🧹" },
  { href: "/coordinator", label: "Check-in Readiness", icon: "✅" },
  { href: "/ops", label: "Ops Overview", icon: "📊" },
];

export default function PanelShell({ title, subtitle, actions, vis, labels, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;          // buttons on the right of the title bar
  vis?: SectionVisibility<any>;       // when given, a show/hide bar is shown under the title
  labels?: Record<string, string>;    // section key -> label (English; translated here)
  children: React.ReactNode;
}) {
  const { tr, ev } = useI18n();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show the last known user instantly (no flicker between screens), then refresh.
    try { const c = sessionStorage.getItem("panelMe"); if (c) setMe(JSON.parse(c)); } catch {}
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        setMe(m);
        try { sessionStorage.setItem("panelMe", JSON.stringify(m)); } catch {}
      })
      .catch(() => {});
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((n) => me && (SCREENS[n.href] ?? []).includes(me.role as Role));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    try { sessionStorage.removeItem("panelMe"); } catch {}
    window.location.href = "/login";
  }

  return (
    <div className="panel-root">
      <div className={"panel-scrim" + (open ? " open" : "")} onClick={() => setOpen(false)} />
      <aside className={"panel-sidebar" + (open ? " open" : "")}>
        <div className="panel-brand"><Logo height={34} /></div>
        <div className="panel-nav-label">{tr("Menu")}</div>
        <nav className="panel-nav">
          {items.map((n) => (
            <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>
              <span className="ico" aria-hidden>{n.icon}</span>
              <span>{tr(n.label)}</span>
            </Link>
          ))}
        </nav>
        {me && (
          <div className="panel-user">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "0 0 auto" }}>
                {me.name.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{ev(me.role)}</div>
              </div>
            </div>
            <button style={{ ...S.small, width: "100%", padding: "7px 10px" }} onClick={logout}>{tr("Sign out")}</button>
          </div>
        )}
      </aside>

      <div className="panel-main">
        <header className="panel-topbar">
          <button className="panel-burger" aria-label={tr("Menu")} onClick={() => setOpen(true)}>☰</button>
          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
            <h1 style={{ fontSize: 17, margin: 0 }}>{title}</h1>
            {subtitle && <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0", maxWidth: 640 }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </header>

        <div className="panel-content">
          {vis && labels && <SectionToggles vis={vis} labels={labels} />}
          {vis?.none && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{tr("Everything is hidden. Use the buttons above to show a section.")}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// "Show / hide: [Overview] [Staff] [Houses] …  Show all · Hide all"
function SectionToggles({ vis, labels }: { vis: SectionVisibility<any>; labels: Record<string, string> }) {
  const { tr } = useI18n();
  const keys = vis.keys as readonly string[];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-soft)" }}>{tr("Show / hide")}</span>
      <Pills
        multi
        options={[...keys]}
        value={keys.filter((k) => vis.shown[k])}
        label={(k) => tr(labels[k] ?? k)}
        onChange={(on: string[]) => vis.setVisible(on)}
      />
      <button style={S.small} onClick={() => vis.setAll(true)}>{tr("Show all")}</button>
      <button style={S.small} onClick={() => vis.setAll(false)}>{tr("Hide all")}</button>
    </div>
  );
}

// A white block with a title bar. `flush` removes the inner padding (for tables).
export function PanelCard({ title, subtitle, action, flush, children }: {
  title?: string; subtitle?: string; action?: React.ReactNode; flush?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="panel-card" style={{ marginBottom: 18 }}>
      {(title || action) && (
        <div className="panel-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 style={{ fontSize: 14, margin: 0 }}>{title}</h2>}
            {subtitle && <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "2px 0 0" }}>{subtitle}</p>}
          </div>
          {action && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: flush ? 0 : 16, overflowX: flush ? "auto" : undefined }}>{children}</div>
    </section>
  );
}

// Row of number tiles at the top of a panel.
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 18 }}>{children}</div>;
}

export function StatCard({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div className="panel-card" style={{ padding: "12px 14px", borderLeft: `4px solid ${color ?? "var(--line)"}` }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--ink)", lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3 }}>{label}</div>
    </div>
  );
}
