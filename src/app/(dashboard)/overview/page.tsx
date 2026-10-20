"use client";

import Link from "next/link";
import { duration, istDay, LAST_90_DAYS, languageName, timeAgo, useApi, useNow } from "@/lib/api";
import type { CaseSummary, Languages, LostFoundStats, Outcomes, Overview, Page } from "@/lib/api-types";
import { ErrorBox, Loading, needsAction, PriorityBadge, StatusBadge } from "@/components/ui";

const WEEK = () => `from=${istDay(6)}&to=${istDay(0)}`;

function StatCard({ label, today, week, accent, note }: { label: string; today: React.ReactNode; week?: React.ReactNode; accent?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-foreground-dim mb-3">{label}</p>
      <span className={`text-2xl sm:text-3xl font-semibold tabular-nums ${accent ?? "text-foreground"}`}>{today}</span>
      <p className="mt-1.5 text-xs text-foreground-muted">{week !== undefined ? <>{week} this week</> : note}</p>
    </div>
  );
}

function Bars({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (!total) return <p className="text-xs text-foreground-dim py-8 text-center">{empty}</p>;
  return (
    <div className="space-y-3.5">
      {rows.map((r) => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-foreground">{r.label}</span>
              <span className="text-foreground-dim tabular-nums">
                {r.count} ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-raised overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OverviewPage() {
  const now = useNow();
  const overview = useApi<Overview>(`/api/stats/overview?${WEEK()}`, 60000);
  const outcomes = useApi<Outcomes>(`/api/stats/outcomes?${WEEK()}`, 60000);
  const languages = useApi<Languages>(`/api/stats/languages?${WEEK()}`, 60000);
  const recent = useApi<Page<CaseSummary>>(`/api/cases?${LAST_90_DAYS()}&limit=50`, 30000);
  const lostFound = useApi<LostFoundStats>(`/api/lost-found/stats?${WEEK()}`, 60000);
  const lfToday = lostFound.data?.perDay.find((d) => d.day === istDay(0))?.reported ?? 0;
  const lfWeek = lostFound.data?.perDay.reduce((sum, d) => sum + d.reported, 0) ?? 0;

  const o = overview.data;
  const today = o?.perDay[o.perDay.length - 1];
  const open = (recent.data?.items ?? []).filter((e) => needsAction(e.status));
  const openP1 = open.filter((e) => e.priority === "P1").length;
  const costToday = o?.cost && today ? Math.round(today.minutes * o.cost.perMinuteInr) : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} · Nashik Gramin
          Police
        </p>
      </div>

      {open.length > 0 && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-p1/30 bg-p1-bg px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-p1" />
            <p className="text-sm font-medium text-foreground">
              {open.length} {open.length === 1 ? "emergency is" : "emergencies are"} waiting to be acknowledged
              {openP1 > 0 && `, ${openP1} of them P1`}
            </p>
          </div>
          <Link href="/emergencies" className="text-xs font-semibold text-p1 hover:underline">
            Open emergencies →
          </Link>
        </div>
      )}

      {overview.error && (
        <div className="mb-6">
          <ErrorBox message={overview.error} onRetry={overview.reload} />
        </div>
      )}
      {!o && overview.loading && <Loading label="Loading today's numbers…" />}

      {o && today && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 mb-8">
          <StatCard label="Calls today" today={today.calls} week={o.totals.calls} />
          <StatCard label="Emergencies today" today={today.emergencies} week={o.totals.emergencies} accent="text-p1" />
          <StatCard label="WhatsApp alerts sent today" today={today.alertsSent} week={o.totals.alertsSent} />
          {lostFound.data ? (
            <StatCard label="Lost and found reported today" today={lfToday} week={lfWeek} />
          ) : (
            <StatCard label="Lost and found today" today="—" note={lostFound.errorCode === "not_connected" ? "Comes with phase 3" : lostFound.error ? "Couldn't load" : "Loading…"} />
          )}
          <StatCard
            label="Cost today"
            today={costToday === null ? "—" : `₹${costToday.toLocaleString("en-IN")}`}
            note={
              costToday === null
                ? "Not recorded yet"
                : `${Math.round(today.minutes)} call minutes · avg call ${duration(o.totals.avgDurationSec)}`
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Emergencies by type</h2>
          <p className="text-xs text-foreground-dim mt-0.5 mb-4">Last 7 days</p>
          {outcomes.error ? (
            <ErrorBox message={outcomes.error} onRetry={outcomes.reload} />
          ) : outcomes.data ? (
            <Bars
              rows={outcomes.data.emergencies.byCategory.map((c) => ({ label: c.mr ? `${c.mr} (${c.en})` : c.en, count: c.count }))}
              empty="No emergencies in the last 7 days."
            />
          ) : (
            <Loading />
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Calls by language</h2>
          <p className="text-xs text-foreground-dim mt-0.5 mb-4">Last 7 days, as detected after each call</p>
          {languages.error ? (
            <ErrorBox message={languages.error} onRetry={languages.reload} />
          ) : languages.data ? (
            <Bars
              rows={languages.data.languages.map((l) => ({ label: l.language === "unknown" ? "Not detected" : languageName(l.language), count: l.calls }))}
              empty="No calls in the last 7 days."
            />
          ) : (
            <Loading />
          )}
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Recent emergencies</h2>
          <Link href="/emergencies" className="text-xs text-accent hover:underline font-medium">
            View all →
          </Link>
        </div>
        {recent.error && <ErrorBox message={recent.error} onRetry={recent.reload} />}
        {recent.data && recent.data.items.length === 0 && (
          <p className="rounded-xl border border-border bg-surface text-xs text-foreground-dim py-8 text-center">No emergencies in the last 90 days.</p>
        )}
        {recent.data && recent.data.items.length > 0 && (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {recent.data.items.slice(0, 5).map((e, i, shown) => (
              <Link
                key={e.id}
                href={`/emergencies/${encodeURIComponent(e.id)}`}
                className={`flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors ${i < shown.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PriorityBadge priority={e.priority} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{e.summary ?? e.category.en}</p>
                    <p className="text-xs text-foreground-dim truncate mt-0.5">
                      {e.id} · {e.place ?? "Place not given"} · {e.station ?? "Station not found"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-foreground-dim tabular-nums">{timeAgo(e.createdAt, now)}</span>
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
