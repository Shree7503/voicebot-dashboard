"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dateTime, istDay, LAST_90_DAYS, timeAgo, useApi, useNow } from "@/lib/api";
import type { LostFoundItem, LostFoundKind, LostFoundStats, Page } from "@/lib/api-types";
import { Empty, ErrorBox, Loading } from "@/components/ui";
import { CloseLostFound } from "@/components/lost-found-close";
import { itemLabel, statusOf } from "./labels";

const WEEK = () => `from=${istDay(6)}&to=${istDay(0)}`;

/**
 * Lost and found: figures, and a list by status. Open a report for its item details, its call
 * and its timeline; close it from either place once the item is back with its owner.
 */
export default function LostFoundPage() {
  const router = useRouter();
  const now = useNow(60000);
  const [kind, setKind] = useState<"all" | LostFoundKind>("all");
  const [openOnly, setOpenOnly] = useState(true);
  const week = useApi<LostFoundStats>(`/api/lost-found/stats?${WEEK()}`, 60000);
  const query = `${LAST_90_DAYS()}&limit=200${kind === "all" ? "" : `&kind=${kind}`}${openOnly ? "&open=true" : ""}`;
  const list = useApi<Page<LostFoundItem>>(`/api/lost-found?${query}`, 60000);

  const s = week.data;
  const today = s?.perDay.find((d) => d.day === istDay(0));

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Lost and found</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Lost and found items reported to the bot. Open a report for its details and the call; close it once the item is back with its owner.
        </p>
      </div>

      {week.error && (
        <div className="mb-6">
          <ErrorBox message={week.error} onRetry={week.reload} />
        </div>
      )}
      {!s && week.loading && <Loading label="Loading figures…" />}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 mb-8">
          <Figure label="Lost items reported today" value={today?.lost ?? 0} note={`${s.reported.lost} this week`} />
          <Figure label="Found items reported today" value={today?.found ?? 0} note={`${s.reported.found} this week`} />
          <Figure label="Still open" value={s.open.lost + s.open.found} note={`${s.open.lost} lost · ${s.open.found} found`} />
          <Figure
            label="Matches to check"
            value={s.matchesToCheck}
            accent={s.matchesToCheck ? "text-p2" : undefined}
            note={s.strongMatchesToCheck ? `${s.strongMatchesToCheck} strong` : "Suggested by the bot"}
          />
          <Figure label="Returned or closed" value={s.resolved} accent={s.resolved ? "text-success" : undefined} note="All time" />
        </div>
      )}

      <section>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-foreground">Reports, last 90 days</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "lost", "found"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  kind === value ? "bg-accent text-white" : "text-foreground-dim hover:bg-surface-raised hover:text-foreground"
                }`}
              >
                {value === "all" ? "Lost and found" : value === "lost" ? "Lost" : "Found"}
              </button>
            ))}
            <div className="h-4 w-px bg-border mx-1" />
            <label className="inline-flex items-center gap-1.5 text-xs text-foreground-muted cursor-pointer">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-accent" />
              Open only
            </label>
          </div>
        </div>

        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading label="Loading reports…" />}
        {list.data && list.data.items.length === 0 && (
          <Empty>{openOnly ? "No open reports. Untick “Open only” to see returned and closed ones." : "No lost or found items reported in the last 90 days."}</Empty>
        )}

        {list.data && list.data.items.length > 0 && (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-[96px_56px_minmax(0,1fr)_116px_minmax(0,1.3fr)_minmax(0,1fr)_76px_64px] gap-4 px-5 py-3 border-b border-border text-[11px] font-medium text-foreground-dim uppercase tracking-wider bg-surface-raised/40">
              <span>Reference</span>
              <span>Report</span>
              <span>Item</span>
              <span>Status</span>
              <span>Match</span>
              <span>Station</span>
              <span>Reported</span>
              <span className="sr-only">Actions</span>
            </div>
            {list.data.items.map((r, i, all) => {
              const status = statusOf(r);
              const href = `/lost-found/${encodeURIComponent(r.id)}`;
              const open = r.state === "open" && r.caseStatus !== "closed";
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(href)}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:grid lg:grid-cols-[96px_56px_minmax(0,1fr)_116px_minmax(0,1.3fr)_minmax(0,1fr)_76px_64px] px-5 py-3 cursor-pointer hover:bg-surface-hover transition-colors ${
                    i < all.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="text-xs font-mono text-accent hover:underline">
                    {r.id}
                  </Link>
                  <span className={`text-xs font-semibold ${r.kind === "lost" ? "text-p3" : "text-success"}`}>
                    {r.kind === "lost" ? "Lost" : r.kind === "found" ? "Found" : "—"}
                  </span>
                  <span className="text-sm text-foreground truncate">{itemLabel(r.item, false)}</span>
                  <span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {r.match ? (
                      <>
                        <span className="font-mono text-foreground">{r.match.with}</span>
                        {r.match.score !== null && <span className="tabular-nums"> · score {r.match.score}</span>}
                        {r.match.strong && <span className="ml-1 font-semibold text-p2">strong</span>}
                      </>
                    ) : (
                      <span className="text-foreground-dim">None yet</span>
                    )}
                  </span>
                  <span className="text-sm text-foreground-muted truncate">{r.station ?? "Station not found"}</span>
                  <span className="text-xs text-foreground-dim tabular-nums" title={dateTime(r.reportedAt)}>
                    {timeAgo(r.reportedAt, now)}
                  </span>
                  <span className="lg:text-right" onClick={(e) => e.stopPropagation()}>
                    {open && (
                      <CloseLostFound
                        compact
                        id={r.id}
                        matches={r.match ? [{ id: r.match.with, open: null, score: r.match.score, strong: r.match.strong }] : []}
                        onClosed={() => {
                          list.reload();
                          week.reload();
                        }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
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
