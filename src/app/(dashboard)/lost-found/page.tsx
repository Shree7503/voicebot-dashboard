"use client";

import { useState } from "react";
import { dateTime, istDay, LAST_90_DAYS, timeAgo, useApi, useNow } from "@/lib/api";
import type { LostFoundItem, LostFoundKind, LostFoundStats, Page } from "@/lib/api-types";
import { Empty, ErrorBox, Loading } from "@/components/ui";

const WEEK = () => `from=${istDay(6)}&to=${istDay(0)}`;

/** Item types the bot records (lostFound.group), in English and Marathi. */
const ITEMS: Record<string, string> = {
  phone: "Phone · फोन",
  wallet: "Wallet · पाकीट",
  jewellery: "Jewellery · दागिने",
  footwear: "Footwear · पादत्राणे",
  bag: "Bag · बॅग",
  documents: "Documents · कागदपत्रे",
  vehicle: "Vehicle · वाहन",
  other: "Other · इतर",
};

function itemLabel(item: string | null): string {
  if (!item) return "Not given";
  return ITEMS[item] ?? item.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function statusOf(r: LostFoundItem): { label: string; style: string } {
  if (r.caseStatus === "closed") return { label: "Closed", style: "bg-surface-raised text-foreground-dim" };
  if (r.state && r.state !== "open") {
    return { label: r.state.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), style: "bg-success/15 text-success" };
  }
  if (r.match) return { label: "Match to check", style: "bg-p2-bg text-p2" };
  return { label: "Open", style: "bg-accent/10 text-accent" };
}

/**
 * Lost and found as figures and statuses, read from the bot's own records. Nothing that
 * identifies an item or a person (brand, colour, marks, IMEI, phone numbers, description) is
 * fetched, and there are no actions: the bot and the station handle the reports.
 */
export default function LostFoundPage() {
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
          Lost and found items reported to the bot: figures and status. Item details stay with the bot and the station.
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
            <div className="hidden md:grid grid-cols-[110px_70px_1fr_130px_150px_1fr_120px] gap-4 px-5 py-3 border-b border-border text-[11px] font-medium text-foreground-dim uppercase tracking-wider bg-surface-raised/40">
              <span>Reference</span>
              <span>Report</span>
              <span>Item</span>
              <span>Status</span>
              <span>Match</span>
              <span>Station</span>
              <span>Reported</span>
            </div>
            {list.data.items.map((r, i, all) => {
              const status = statusOf(r);
              return (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 md:grid md:grid-cols-[110px_70px_1fr_130px_150px_1fr_120px] px-5 py-3 ${
                    i < all.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <span className="text-xs font-mono text-foreground">{r.id}</span>
                  <span className={`text-xs font-semibold ${r.kind === "lost" ? "text-p3" : "text-success"}`}>
                    {r.kind === "lost" ? "Lost" : r.kind === "found" ? "Found" : "—"}
                  </span>
                  <span className="text-sm text-foreground">{itemLabel(r.item)}</span>
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
