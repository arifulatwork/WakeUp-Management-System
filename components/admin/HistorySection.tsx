"use client";

import { useState } from "react";
import { PanelCard } from "@/components/PanelShell";
import { S } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { renderAudit } from "@/lib/auditText";
import { EmptyNote, LoadError, SkeletonRows, td, th, tableStyle, useApiList } from "./shared";

type Entry = {
  id: string; actorName: string; actorRole: string; summary: string;
  template?: string | null; params?: Record<string, string | number> | null; createdAt: string;
};

const PAGE = 50;

export default function HistorySection() {
  const { tr, ev, locale } = useI18n();
  const [limit, setLimit] = useState(PAGE);
  const { data, error, reload } = useApiList<Entry[]>(`/api/audit?limit=${limit}`, ["auditLog"]);
  const canLoadMore = !!data && data.length >= limit && limit < 500;

  return (
    <PanelCard
      title={tr("Change history")}
      subtitle={tr("Who changed what, and when.")}
      action={<button style={S.small} onClick={reload}>{tr("Refresh")}</button>}
      flush
    >
      {!data ? (
        error ? <LoadError onRetry={reload} /> : <SkeletonRows rows={6} />
      ) : (
        <>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            <table style={{ ...tableStyle, fontSize: 12.5 }}>
              <thead>
                <tr><th style={th}>{tr("When")}</th><th style={th}>{tr("Who")}</th><th style={th}>{tr("What")}</th></tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(h.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</td>
                    <td style={td}>{h.actorName} <span style={{ color: "var(--ink-soft)" }}>· {h.actorRole === "worker" ? tr("Staff") : h.actorRole === "system" ? tr("System") : ev(h.actorRole)}</span></td>
                    <td style={td}>{renderAudit(h, tr, ev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <EmptyNote>{tr("No changes recorded yet.")}</EmptyNote>}
          </div>
          {canLoadMore && (
            <div style={{ padding: 12, textAlign: "center", borderTop: "1px solid var(--line)" }}>
              <button style={S.small} onClick={() => setLimit(limit + PAGE)}>{tr("Load more")}</button>
            </div>
          )}
        </>
      )}
    </PanelCard>
  );
}
