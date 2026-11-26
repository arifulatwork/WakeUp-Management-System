"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PanelCard, StatCard, StatGrid } from "@/components/PanelShell";
import PanelTabs from "@/components/PanelTabs";
import { S, SortTh, useSort } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { applyDir, cmpText, KEY_RANK } from "@/lib/sort";
import { ModeBadge, CheckInGuideButton } from "@/components/CheckInGuide";
import type { EdHouseFull } from "@/components/editors/HouseEditor";
import { LoadError, SearchBox, SkeletonRows, Toolbar, useApiList, useToast } from "./shared";


const KEY_TONE: Record<string, string> = { AT_OFFICE: "ok", WITH_CLEANER: "info", WITH_GUEST: "warn", MISSING: "bad" };
const DAY = 86400000;

function Avatar({ h, archived }: { h: EdHouseFull; archived?: boolean }) {
  return <div className={`h-avatar${h.mode === "TOURISM" ? " tourism" : ""}${archived ? " archived" : ""}`} aria-hidden="true">{(h.name.trim()[0] ?? "?").toUpperCase()}</div>;
}

function NameCell({ h, archived }: { h: EdHouseFull; archived?: boolean }) {
  return (
    <div className="h-cell-name">
      <Avatar h={h} archived={archived} />
      <div style={{ minWidth: 0 }}>
        <div className="h-name">{h.name}<ModeBadge mode={h.mode} /></div>
        <div className="h-sub">{h.address}</div>
      </div>
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return <div className="h-empty"><div className="h-empty-icon" aria-hidden="true">{icon}</div>{text}</div>;
}

const HouseEditor = dynamic(() => import("@/components/editors/HouseEditor"), { ssr: false });

export default function HousesSection() {
  const { tr, ev, locale } = useI18n();
  const [view, setView] = useState<"active" | "archived">("active");
  const showArchived = view === "archived";
  const { data, error, reload } = useApiList<EdHouseFull[]>("/api/houses", ["house"]);
  // Archived houses are only requested while the Archived tab is open, so the main list loads as fast as before.
  const archived = useApiList<EdHouseFull[]>(showArchived ? "/api/houses?archived=1" : null, ["house"]);
  const sort = useSort<"name" | "address" | "key" | "until">("name");
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [houseEd, setHouseEd] = useState<{ house: EdHouseFull | null } | null>(null);

  const houses = data ?? [];
  const temporary = houses.filter((h) => h.validFrom || h.validUntil).length;

  const archivedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (archived.data ?? [])
      .filter((h) => !q || h.name.toLowerCase().includes(q) || (h.address ?? "").toLowerCase().includes(q))
      .sort((a, b) => cmpText(a.name, b.name));
  }, [archived.data, query]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return houses
      .filter((h) => !q || h.name.toLowerCase().includes(q) || (h.address ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const tie = cmpText(a.name, b.name);
        if (sort.key === "until") {
          // houses with no end date (permanent) always last
          if (!a.validUntil !== !b.validUntil) return a.validUntil ? -1 : 1;
          return applyDir(+new Date(a.validUntil ?? 0) - +new Date(b.validUntil ?? 0), sort.dir) || tie;
        }
        let c = 0;
        if (sort.key === "name") c = cmpText(a.name, b.name);
        if (sort.key === "address") c = cmpText(a.address, b.address);
        if (sort.key === "key") c = KEY_RANK[a.keyStatus] - KEY_RANK[b.keyStatus];
        return applyDir(c, sort.dir) || tie;
      });
  }, [houses, query, sort.key, sort.dir]);

  async function setArchived(h: EdHouseFull, value: boolean) {
    try {
      await api(`/api/houses/${h.id}`, "PATCH", { archived: value });
      toast.show(value ? tr("House archived. You can find it in the Archived tab.") : tr("Changes saved."));
    } catch {
      toast.show(tr("Could not save. Please try again."), false);
    }
    reload();
    archived.reload();
  }

  return (
    <>
      <StatGrid>
        <StatCard n={data ? houses.length : "…"} label={tr("Houses")} />
        <StatCard n={data ? temporary : "…"} label={tr("Temporary houses")} color="#D98A33" />
      </StatGrid>

      <PanelCard
        title={tr("Houses")}
        action={<>
          <button style={S.navDark} onClick={() => setHouseEd({ house: null })}>+ {tr("New house")}</button>
        </>}
        flush
      >
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder={tr("Search by name or address")} />
        </Toolbar>
        <div className="h-tabs">
          <PanelTabs<"active" | "archived">
            tabs={[
              { id: "active", label: data ? `${tr("Houses")} · ${houses.length}` : tr("Houses") },
              { id: "archived", label: archived.data ? `${tr("Archived")} · ${archived.data.length}` : tr("Archived") },
            ]}
            value={view} onChange={setView} label={tr("Houses")} />
        </div>

        {view === "active" && (!data ? (
          error ? <LoadError onRetry={reload} /> : <SkeletonRows />
        ) : houses.length === 0 ? (
          <Empty icon="🏠" text={tr("No houses yet.")} />
        ) : rows.length === 0 ? (
          <Empty icon="🔍" text={tr("No houses match your search.")} />
        ) : (
          <>
            <table className="h-table">
              <thead>
                <tr>
                  <SortTh label={tr("Name")} k="name" sort={sort} />
                  <SortTh label={tr("Address")} k="address" sort={sort} />
                  <SortTh label={tr("Key status")} k="key" sort={sort} />
                  <SortTh label={tr("Valid until")} k="until" sort={sort} />
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const left = h.validUntil ? Math.ceil((+new Date(h.validUntil) - Date.now()) / DAY) : null;
                  return (
                    <tr key={h.id}>
                      <td><NameCell h={h} /></td>
                      <td className="h-addr">{h.address || "—"}</td>
                      <td><span className={`h-pill ${KEY_TONE[h.keyStatus] ?? "muted"}`}>{ev(h.keyStatus)}</span></td>
                      <td className="h-valid">
                        {h.validUntil ? (
                          <>
                            {new Date(h.validUntil).toLocaleDateString(locale)}
                            {left !== null && left < 0 && <small className="bad">{tr("Expired")}</small>}
                            {left !== null && left >= 0 && left <= 7 && <small className="warn">{tr("Ends soon")}</small>}
                          </>
                        ) : <span style={{ color: "var(--ink-soft)" }}>{tr("Permanent")}</span>}
                      </td>
                      <td>
                        <div className="h-actions">
                          <CheckInGuideButton house={h} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", cursor: "pointer" }} />
                          <button className="h-btn primary" onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>
                          <button className="h-btn quiet" onClick={() => setArchived(h, true)}>{tr("Archive")}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="h-count">{rows.length} / {houses.length} {tr("Houses")}</div>
          </>
        ))}

        {showArchived && (!archived.data ? (
          archived.error ? <LoadError onRetry={archived.reload} /> : <SkeletonRows rows={3} />
        ) : archived.data.length === 0 ? (
          <Empty icon="🗄️" text={tr("No archived houses.")} />
        ) : archivedRows.length === 0 ? (
          <Empty icon="🔍" text={tr("No houses match your search.")} />
        ) : (
          <table className="h-table is-archived">
            <thead>
              <tr>
                <th>{tr("Name")}</th>
                <th>{tr("Address")}</th>
                <th>{tr("Key status")}</th>
                <th>{tr("Valid until")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {archivedRows.map((h) => (
                <tr key={h.id}>
                  <td><NameCell h={h} archived /></td>
                  <td className="h-addr">{h.address || "—"}</td>
                  <td><span className="h-pill muted">{tr("Archived")}</span></td>
                  <td className="h-valid"><span style={{ color: "var(--ink-soft)" }}>{h.validUntil ? new Date(h.validUntil).toLocaleDateString(locale) : tr("Permanent")}</span></td>
                  <td>
                    <div className="h-actions">
                      <button className="h-btn" onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>
                      <button className="h-btn primary" onClick={() => setArchived(h, false)}>{tr("Restore")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </PanelCard>

      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={() => { setHouseEd(null); toast.show(tr("Changes saved.")); reload(); if (showArchived) archived.reload(); }} />}
      {toast.node}
    </>
  );
}
