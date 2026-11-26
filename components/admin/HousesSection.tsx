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
import { EmptyNote, LoadError, SearchBox, SkeletonRows, Toolbar, td, th, tableStyle, useApiList, useToast } from "./shared";

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
        <PanelTabs<"active" | "archived">
          tabs={[{ id: "active", label: tr("Houses") }, { id: "archived", label: tr("Archived") }]}
          value={view} onChange={setView} label={tr("Houses")} />

        {view === "active" && (!data ? (
          error ? <LoadError onRetry={reload} /> : <SkeletonRows />
        ) : (
          <>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <SortTh label={tr("Name")} k="name" sort={sort} style={th} />
                  <SortTh label={tr("Address")} k="address" sort={sort} style={th} />
                  <SortTh label={tr("Key status")} k="key" sort={sort} style={th} />
                  <SortTh label={tr("Valid until")} k="until" sort={sort} style={th} />
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <td style={td}>{h.name}<ModeBadge mode={h.mode} /></td>
                    <td style={{ ...td, color: "var(--ink-soft)" }}>{h.address}</td>
                    <td style={td}>{ev(h.keyStatus)}</td>
                    <td style={td}>{h.validUntil ? new Date(h.validUntil).toLocaleDateString(locale) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <CheckInGuideButton house={h} />{" "}
                      <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>{" "}
                      <button style={S.small} onClick={() => setArchived(h, true)}>{tr("Archive")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {houses.length === 0 && <EmptyNote>{tr("No houses yet.")}</EmptyNote>}
            {houses.length > 0 && rows.length === 0 && <EmptyNote>{tr("No houses match your search.")}</EmptyNote>}
          </>
        ))}

        {showArchived && (
          <>
            {!archived.data ? (
              archived.error ? <LoadError onRetry={archived.reload} /> : <SkeletonRows rows={2} />
            ) : archived.data.length === 0 ? (
              <EmptyNote>{tr("No archived houses.")}</EmptyNote>
            ) : archivedRows.length === 0 ? (
              <EmptyNote>{tr("No houses match your search.")}</EmptyNote>
            ) : (
              <table style={tableStyle}>
                <tbody>
                  {archivedRows.map((h) => (
                    <tr key={h.id} style={{ opacity: 0.65 }}>
                      <td style={td}>{h.name}<ModeBadge mode={h.mode} /></td>
                      <td style={{ ...td, color: "var(--ink-soft)" }}>{h.address}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button style={S.small} onClick={() => setHouseEd({ house: h })}>{tr("Edit")}</button>{" "}
                        <button style={S.small} onClick={() => setArchived(h, false)}>{tr("Restore")}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </PanelCard>

      {houseEd && <HouseEditor house={houseEd.house} onClose={() => setHouseEd(null)} onSaved={() => { setHouseEd(null); toast.show(tr("Changes saved.")); reload(); if (showArchived) archived.reload(); }} />}
      {toast.node}
    </>
  );
}
