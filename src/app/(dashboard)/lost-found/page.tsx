"use client";

import { useState } from "react";
import { dateTime, istDay, LAST_90_DAYS, useApi } from "@/lib/api";
import type { LostFoundItem, LostFoundStats, LostFoundStatus, Page } from "@/lib/api-types";
import { Empty, ErrorBox, Loading } from "@/components/ui";

const WEEK = () => `from=${istDay(6)}&to=${istDay(0)}`;

const STATUS: Record<LostFoundStatus, { label: string; style: string; meaning: string }> = {
  open: { label: "Open", style: "bg-p1/10 text-p1", meaning: "Reported, not found yet" },
  suggested: { label: "Match to check", style: "bg-p2-bg text-p2", meaning: "A possible match is waiting to be checked" },
  reunited: { label: "Reunited", style: "bg-success/15 text-success", meaning: "Found and returned" },
  closed: { label: "Closed", style: "bg-surface-raised text-foreground-dim", meaning: "Closed for another reason" },
  unknown: { label: "Unknown", style: "bg-surface-raised text-foreground-dim", meaning: "" },
};

/**
 * Lost and found as figures and statuses only: no names, descriptions or phone numbers, and
 * no actions. The bot records the reports and changes their status.
 */
export default function LostFoundPage() {
  const [filter, setFilter] = useState<"all" | Exclude<LostFoundStatus, "unknown">>("all");
  const allTime = useApi<LostFoundStats>(`/api/lost-found/stats?${LAST_90_DAYS()}`, 60000);
  const week = useApi<LostFoundStats>(`/api/lost-found/stats?${WEEK()}`, 60000);
  const list = useApi<Page<LostFoundItem>>(`/api/lost-found?${LAST_90_DAYS()}&limit=200${filter === "all" ? "" : `&status=${filter}`}`, 60000);

  const header = (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-foreground">Lost and found</h1>
      <p className="text-sm text-foreground-muted mt-0.5">Figures and status of missing-person reports. Details stay with the bot.</p>
    </div>
  );

  if (allTime.errorCode === "not_connected") {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl">
        {header}
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-foreground">Not connected yet.</p>
          <p className="text-xs text-foreground-dim mt-2 max-w-md mx-auto">
            Figures appear here once the bot records lost-and-found reports and its lost-and-found API is set up (phase 3).
          </p>
        </div>
      </div>
    );
  }

  const today = week.data?.perDay.find((d) => d.day === istDay(0));
  const reportedWeek = week.data?.perDay.reduce((sum, d) => sum + d.reported, 0);
  const reunitedWeek = week.data?.perDay.reduce((sum, d) => sum + d.reunited, 0);
  const s = allTime.data?.byStatus;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl">
      {header}

      {(allTime.error || week.error) && (
        <div className="mb-6">
          <ErrorBox message={allTime.error ?? week.error ?? ""} onRetry={() => (allTime.reload(), week.reload())} />
        </div>
      )}
      {!s && allTime.loading && <Loading label="Loading figures…" />}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 mb-8">
          <Figure label="Reported today" value={today?.reported ?? 0} note={`${reportedWeek ?? 0} this week`} />
          <Figure label="Reunited this week" value={reunitedWeek ?? 0} accent="text-success" note={`${s.reunited} in the last 90 days`} />
          <Figure label="Still open" value={s.open} accent={s.open ? "text-p1" : undefined} note="Not found yet" />
          <Figure label="Matches to check" value={s.suggested} accent={s.suggested ? "text-p2" : undefined} note="Waiting to be confirmed" />
        </div>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-foreground">Reports, last 90 days</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "open", "suggested", "reunited", "closed"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === value ? "bg-accent text-white" : "text-foreground-dim hover:bg-surface-raised hover:text-foreground"
                }`}
              >
                {value === "all" ? "All" : STATUS[value].label}
                {s && value !== "all" && <span className="ml-1 tabular-nums opacity-80">{s[value]}</span>}
              </button>
            ))}
          </div>
        </div>

        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading label="Loading reports…" />}
        {list.data && list.data.items.length === 0 && <Empty>No reports{filter === "all" ? "" : ` with status “${STATUS[filter].label}”`} in the last 90 days.</Empty>}

        {list.data && list.data.items.length > 0 && (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="hidden sm:grid grid-cols-[120px_140px_1fr_150px] gap-4 px-5 py-3 border-b border-border text-[11px] font-medium text-foreground-dim uppercase tracking-wider bg-surface-raised/40">
              <span>Reference</span>
              <span>Status</span>
              <span>Station</span>
              <span>Reported</span>
            </div>
            {list.data.items.map((item, i, all) => (
              <div
                key={item.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 sm:grid sm:grid-cols-[120px_140px_1fr_150px] px-5 py-3 ${i < all.length - 1 ? "border-b border-border" : ""}`}
              >
                <span className="text-xs font-mono text-foreground">{item.id}</span>
                <span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[item.status].style}`} title={STATUS[item.status].meaning}>
                    {STATUS[item.status].label}
                  </span>
                </span>
                <span className="text-sm text-foreground-muted truncate">{item.station ?? "Station not found"}</span>
                <span className="text-xs text-foreground-dim tabular-nums">{item.reportedAt ? dateTime(item.reportedAt) : "—"}</span>
              </div>
            ))}
          </div>
        )}
        {list.data?.nextBefore && <p className="mt-3 text-xs text-foreground-dim">Showing the 200 most recent reports.</p>}
      </section>
    </div>
  );
}

function Figure({ label, value, note, accent }: { label: string; value: number; note: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-foreground-dim mb-3">{label}</p>
      <span className={`text-2xl sm:text-3xl font-semibold tabular-nums ${accent ?? "text-foreground"}`}>{value}</span>
      <p className="mt-1.5 text-xs text-foreground-muted">{note}</p>
    </div>
  );
}
