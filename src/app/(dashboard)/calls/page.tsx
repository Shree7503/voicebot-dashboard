"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { dateTime, duration, LAST_90_DAYS, languageName, timeAgo, useApi, useNow } from "@/lib/api";
import type { CallRow, Outcome, Page } from "@/lib/api-types";
import { Empty, ErrorBox, Loading } from "@/components/ui";

const OUTCOME_LABEL: Record<Outcome, string> = { completed: "Completed", short: "Hung up early", no_speech: "No speech" };

export default function CallsPage() {
  const now = useNow(60000);
  const { data, error, loading, reload } = useApi<Page<CallRow>>(`/api/calls?${LAST_90_DAYS()}&limit=200`);
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("all");
  const [outcome, setOutcome] = useState<"all" | Outcome>("all");

  const items = useMemo(() => data?.items ?? [], [data]);
  const languages = useMemo(() => [...new Set(items.map((c) => c.language ?? "unknown"))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (language !== "all" && (c.language ?? "unknown") !== language) return false;
      if (outcome !== "all" && c.outcome !== outcome) return false;
      if (q) return [c.id, c.summary, ...c.topics, ...c.cases.map((x) => x.id)].some((v) => v?.toLowerCase().includes(q));
      return true;
    });
  }, [items, search, language, outcome]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Calls</h1>
        <p className="text-xs text-foreground-muted mt-0.5">Every call in the last 90 days, newest first. Open a call for its transcript.</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 bg-surface p-3 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:border-accent"
          >
            <option value="all">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l === "unknown" ? "Not detected" : languageName(l)}
              </option>
            ))}
          </select>
          {(["all", "completed", "short", "no_speech"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                outcome === o ? "bg-accent text-white" : "text-foreground-dim hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              {o === "all" ? "All calls" : OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search summary, topic, case…"
          aria-label="Search calls"
          className="w-full md:w-64 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground placeholder-foreground-dim outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading calls…" />}
      {data && filtered.length === 0 && <Empty>{items.length === 0 ? "No calls in the last 90 days." : "No calls match these filters."}</Empty>}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
          <div className="hidden sm:grid grid-cols-[130px_1fr_70px_100px_110px] gap-4 px-5 py-3 border-b border-border text-[11px] font-medium text-foreground-dim uppercase tracking-wider bg-surface-raised/40">
            <span>When</span>
            <span>What it was about</span>
            <span>Length</span>
            <span>Language</span>
            <span>Outcome</span>
          </div>
          {filtered.map((c, i) => (
            <Link
              key={c.id}
              href={`/calls/${encodeURIComponent(c.id)}`}
              className={`block sm:grid sm:grid-cols-[130px_1fr_70px_100px_110px] gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors ${
                i < filtered.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <span className="block text-xs text-foreground-muted tabular-nums" title={timeAgo(c.startedAt, now)}>
                {dateTime(c.startedAt)}
              </span>
              <div className="min-w-0 my-1 sm:my-0">
                <p className={`text-sm truncate ${c.summary ? "text-foreground font-medium" : "text-foreground-dim italic"}`}>
                  {c.summary ?? (c.processing === "summarised" ? "No summary" : c.processing === "failed" ? "Summary failed; the bot retries it" : "Summary not ready yet")}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {c.cases.map((x) => (
                    <span key={x.id} className="text-[10px] bg-p1/10 text-p1 font-bold px-1.5 py-0.5 rounded">
                      {x.priority} {x.id}
                    </span>
                  ))}
                  {c.topics.map((t) => (
                    <span key={t} className="text-[10px] bg-surface-raised text-foreground-dim px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                  <span className="text-[10px] text-foreground-dim font-mono">{c.channel}</span>
                </div>
              </div>
              <span className="inline-block mr-3 sm:mr-0 text-sm text-foreground-muted tabular-nums">{duration(c.durationSec)}</span>
              <span className="inline-block mr-3 sm:mr-0 text-sm text-foreground-muted">{languageName(c.language)}</span>
              <span className={`inline-block text-xs ${c.outcome === "completed" ? "text-foreground-muted" : "text-p2"}`}>{OUTCOME_LABEL[c.outcome]}</span>
            </Link>
          ))}
        </div>
      )}

      {data && (
        <p className="mt-3 text-xs text-foreground-dim">
          Showing {filtered.length} of {items.length} calls{data.nextBefore ? " (the 200 most recent)" : ""}.
        </p>
      )}
    </div>
  );
}
