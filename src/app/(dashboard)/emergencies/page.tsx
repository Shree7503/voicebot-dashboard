"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, LAST_90_DAYS, timeAgo, useApi, useNow } from "@/lib/api";
import type { CaseSummary, CaseDetail, Page, VerdictValue } from "@/lib/api-types";
import {
  CallerNumber,
  CredibilityText,
  Empty,
  ErrorBox,
  Loading,
  needsAction,
  PriorityBadge,
  StatusBadge,
  VerdictBadge,
} from "@/components/ui";

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
type StatusFilter = "open" | "action" | "acknowledged" | "closed" | "all";

const STATUS_FILTERS: [StatusFilter, string][] = [
  ["open", "Open"],
  ["action", "Needs action"],
  ["acknowledged", "Acknowledged"],
  ["closed", "Closed"],
  ["all", "All"],
];

export default function EmergenciesPage() {
  const now = useNow();
  // refreshed every 30 seconds so new emergencies appear without reloading
  const { data, error, loading, reload, setData } = useApi<Page<CaseSummary>>(`/api/cases?${LAST_90_DAYS()}&limit=200`, 30000);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [station, setStation] = useState("all");
  const [search, setSearch] = useState("");

  const items = useMemo(() => data?.items ?? [], [data]);
  const stations = useMemo(() => [...new Set(items.map((e) => e.station).filter((s): s is string => Boolean(s)))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((e) => {
        if (statusFilter === "open" && e.status === "closed") return false;
        if (statusFilter === "action" && !needsAction(e.status)) return false;
        if ((statusFilter === "acknowledged" || statusFilter === "closed") && e.status !== statusFilter) return false;
        if (priorityFilter !== "all" && e.priority !== priorityFilter) return false;
        if (station !== "all" && e.station !== station) return false;
        if (q) {
          return [e.id, e.summary, e.place, e.station, e.category.en, e.category.mr].some((v) => v?.toLowerCase().includes(q));
        }
        return true;
      })
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || b.createdAt.localeCompare(a.createdAt));
  }, [items, statusFilter, priorityFilter, station, search]);

  const replace = (updated: CaseDetail) =>
    setData((page) => ({
      ...page,
      items: page.items.map((e) =>
        e.id === updated.id ? { ...e, status: updated.status, verdict: updated.verdict?.value ?? null, acknowledgedAt: updated.acknowledgedAt, closedAt: updated.closedAt } : e,
      ),
    }));

  const waiting = items.filter((e) => needsAction(e.status)).length;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Emergencies</h1>
          <p className="text-xs text-foreground-muted mt-0.5">
            P1 first, then newest. Refreshes every 30 seconds.
            {waiting > 0 && <span className="text-p1 font-semibold"> {waiting} waiting to be acknowledged.</span>}
          </p>
        </div>
        {stations.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label htmlFor="station-filter-em" className="text-xs font-medium text-foreground-dim whitespace-nowrap">
              Station:
            </label>
            <select
              id="station-filter-em"
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            >
              <option value="all">All stations</option>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 bg-surface p-3 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === value ? "bg-accent text-white" : "text-foreground-dim hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
          {(["all", "P1", "P2", "P3"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                priorityFilter === p
                  ? p === "P1"
                    ? "bg-p1 text-white"
                    : p === "P2"
                      ? "bg-p2 text-white"
                      : "bg-surface-raised text-foreground"
                  : "text-foreground-dim hover:bg-surface-raised"
              }`}
            >
              {p === "all" ? "All priorities" : p}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, place, what happened…"
          aria-label="Search emergencies"
          className="w-full md:w-64 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground placeholder-foreground-dim outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading emergencies…" />}
      {data && filtered.length === 0 && (
        <Empty>{items.length === 0 ? "No emergencies reported in the last 90 days." : "No emergencies match these filters."}</Empty>
      )}

      <div className="space-y-3">
        {filtered.map((e) => (
          <EmergencyCard key={e.id} emergency={e} now={now} onChanged={replace} />
        ))}
      </div>
    </div>
  );
}

function EmergencyCard({ emergency: e, now, onChanged }: { emergency: CaseSummary; now: number; onChanged: (c: CaseDetail) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (label: string, body: { action: "status"; status: "acknowledged" | "closed" } | { action: "verdict"; verdict: VerdictValue }) => {
    setBusy(label);
    setError(null);
    try {
      onChanged(await api<CaseDetail>(`/api/cases/${encodeURIComponent(e.id)}`, { method: "PATCH", body }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const urgent = e.priority === "P1" && needsAction(e.status);
  const button = "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className={`rounded-xl border bg-surface overflow-hidden transition-all shadow-xs ${urgent ? "border-p1 ring-1 ring-p1/30" : "border-border"}`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <PriorityBadge priority={e.priority} />
          <span className="text-xs font-mono font-medium text-foreground-dim">{e.id}</span>
          <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent" title={e.category.en}>
            {e.category.mr ?? e.category.en}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{e.summary ?? e.category.en}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground-muted">
            <span>📍 {e.place ?? "Place not given"}</span>
            <span>🏢 {e.station ?? "Station not found"}</span>
            <CallerNumber masked={e.caller} revealPath={`/api/cases/${encodeURIComponent(e.id)}/caller`} />
            <span>
              🎯 Credibility: <CredibilityText level={e.credibility} />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start">
          <StatusBadge status={e.status} />
          <span className={`text-xs tabular-nums ${urgent ? "text-p1 font-semibold" : "text-foreground-dim"}`} title={new Date(e.createdAt).toLocaleString("en-IN")}>
            {timeAgo(e.createdAt, now)}
          </span>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border bg-surface-raised/40 flex flex-wrap items-center gap-2">
        {needsAction(e.status) && (
          <button disabled={busy !== null} onClick={() => act("ack", { action: "status", status: "acknowledged" })} className={`${button} bg-accent text-white font-semibold hover:bg-accent/90`}>
            {busy === "ack" ? "Acknowledging…" : "Acknowledge"}
          </button>
        )}
        {e.status !== "closed" && (
          <button
            disabled={busy !== null}
            onClick={() => act("close", { action: "status", status: "closed" })}
            className={`${button} border border-border bg-surface text-foreground-muted hover:bg-surface-raised hover:text-foreground`}
          >
            {busy === "close" ? "Closing…" : "Close"}
          </button>
        )}
        {e.verdict ? (
          <VerdictBadge verdict={e.verdict} />
        ) : (
          <>
            <button disabled={busy !== null} onClick={() => act("genuine", { action: "verdict", verdict: "genuine" })} className={`${button} bg-success/15 text-success hover:bg-success/25`}>
              {busy === "genuine" ? "Saving…" : "Genuine"}
            </button>
            <button disabled={busy !== null} onClick={() => act("hoax", { action: "verdict", verdict: "hoax" })} className={`${button} bg-p1/15 text-p1 hover:bg-p1/25`}>
              {busy === "hoax" ? "Saving…" : "Hoax"}
            </button>
          </>
        )}
        {error && <span className="text-xs text-p1">{error}</span>}
        <div className="flex-1" />
        <Link href={`/emergencies/${encodeURIComponent(e.id)}`} className="px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:underline">
          Timeline &amp; transcript →
        </Link>
      </div>
    </div>
  );
}
