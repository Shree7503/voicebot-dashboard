"use client";

import { use } from "react";
import Link from "next/link";
import { dateTime, duration, languageName, timeAgo, useApi, useNow } from "@/lib/api";
import type { LostFoundDetail } from "@/lib/api-types";
import { CallerNumber, ErrorBox, Loading } from "@/components/ui";
import { TranscriptPanel } from "@/components/transcript";
import { CloseLostFound } from "@/components/lost-found-close";
import { itemLabel, statusOf } from "../labels";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LostFoundDetailPage(props: PageProps) {
  const { id } = use(props.params);
  const reportId = decodeURIComponent(id);
  const now = useNow();
  const { data: r, error, loading, reload, setData } = useApi<LostFoundDetail>(`/api/lost-found/${encodeURIComponent(reportId)}`);

  const back = (
    <Link href="/lost-found" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors">
      ← Back to lost and found
    </Link>
  );

  if (!r) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl space-y-6">
        {back}
        {loading && <Loading label="Loading report…" />}
        {error && <ErrorBox message={error} onRetry={reload} />}
      </div>
    );
  }

  const status = statusOf({ state: r.state, caseStatus: r.caseStatus, match: r.matches[0] ?? null });
  const sortedMatches = [...r.matches].sort((a, b) => Number(b.strong) - Number(a.strong) || (b.score ?? 0) - (a.score ?? 0));
  const title = r.item.name ? r.item.name.charAt(0).toUpperCase() + r.item.name.slice(1) : itemLabel(r.item.group);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl">
      <div className="mb-5">{back}</div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${r.kind === "lost" ? "bg-p3-bg text-p3" : "bg-success/15 text-success"}`}>
            {r.kind === "lost" ? "Lost" : r.kind === "found" ? "Found" : "Report"}
          </span>
          <span className="text-xs font-mono font-medium text-foreground-dim">{r.id}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground leading-relaxed">
          {title}
          {r.item.brand && <span className="text-foreground-muted font-normal"> · {r.item.brand}</span>}
        </h1>
        {r.description.mr && <p className="text-sm text-foreground-muted mt-1">{r.description.mr}</p>}
      </div>

      {r.open ? (
        <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl border border-border bg-surface mb-6">
          <span className="text-xs text-foreground-dim">Item back with its owner, or nothing more to do?</span>
          <CloseLostFound id={r.id} matches={sortedMatches} onClosed={(updated) => setData(() => updated)} />
        </div>
      ) : (
        r.closed && (
          <div className="p-3.5 rounded-xl border border-success/30 bg-success/10 mb-6 text-sm text-foreground">
            {r.closed.reason === "returned" ? "Returned to the owner" : "Closed"} on {dateTime(r.closed.at)}
            {r.closed.by && ` by ${r.closed.by}`}
            {r.closed.note && <span className="block text-xs text-foreground-muted mt-1">{r.closed.note}</span>}
          </div>
        )
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-xl border border-border bg-surface mb-6">
        <Detail label="Item">{itemLabel(r.item.group)}</Detail>
        <Detail label="Colour">{r.item.colour ?? "Not given"}</Detail>
        <Detail label="Marks">{r.item.marks ?? "Not given"}</Detail>
        <Detail label="Name on the item">{r.item.nameOnItem ?? "Not given"}</Detail>
        <Detail label={r.kind === "found" ? "Where it was found" : "Where it was lost"}>
          {r.place.spoken ?? "Not given"}
          {r.place.english && r.place.english !== r.place.spoken && <span className="text-foreground-dim"> ({r.place.english})</span>}
        </Detail>
        <Detail label={r.kind === "found" ? "When it was found" : "When it was lost"}>{r.item.when ?? "Not given"}</Detail>
        <Detail label="Police station">
          {r.station?.name ?? "Not found"}
          {r.station?.phone && (
            <a href={`tel:${r.station.phone}`} className="ml-2 text-accent underline font-mono text-xs">
              {r.station.phone}
            </a>
          )}
          {r.station?.officer && <span className="block text-xs text-foreground-dim">{r.station.officer}</span>}
        </Detail>
        <Detail label="Caller">
          <CallerNumber masked={r.caller} revealPath={`/api/lost-found/${encodeURIComponent(r.id)}/caller`} />
        </Detail>
        <Detail label="Reported">
          {dateTime(r.reportedAt)} <span className="text-foreground-dim">({timeAgo(r.reportedAt, now)})</span>
        </Detail>
        {r.description.asGiven && r.description.asGiven !== r.description.mr && <Detail label="As the caller said it">{r.description.asGiven}</Detail>}
      </div>

      {r.matches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">Suggested matches</h2>
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {r.matches.map((m, i) => (
              <Link
                key={m.id}
                href={`/lost-found/${encodeURIComponent(m.id)}`}
                className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover transition-colors ${i < r.matches.length - 1 ? "border-b border-border" : ""}`}
              >
                <span className="text-sm text-foreground">
                  <span className="font-mono">{m.id}</span>
                  {m.item && <span className="text-foreground-muted"> · {m.item}</span>}
                </span>
                <span className="text-xs text-foreground-muted">
                  {m.score !== null && `score ${m.score}`}
                  {m.strong && <span className="ml-1 font-semibold text-p2">strong</span>}
                  <span className="ml-2">{m.open === false ? "closed" : "open"} →</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-3">The call</h2>
        {r.call ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border border-border bg-surface mb-3">
              <Detail label="Time">{dateTime(r.call.startedAt)}</Detail>
              <Detail label="Length">{duration(r.call.durationSec)}</Detail>
              <Detail label="Language">{languageName(r.call.language)}</Detail>
              <Detail label="Channel">{r.call.channel ?? "—"}</Detail>
              <div className="col-span-2 sm:col-span-4">
                <Detail label="Summary">
                  {r.call.summary ?? (r.call.processing === "summarised" ? "No summary" : "The summary is not ready yet")}
                </Detail>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <Link href={`/calls/${encodeURIComponent(r.call.id)}`} className="text-xs font-medium text-accent hover:underline">
                  Open the call page →
                </Link>
              </div>
            </div>
            <TranscriptPanel callId={r.call.id} />
          </>
        ) : (
          <p className="text-sm text-foreground-dim">No call is linked to this report.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4">Timeline</h2>
        <div className="relative pl-6 border-l-2 border-border space-y-4">
          {r.timeline.map((t, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" />
              <p className="text-sm font-medium text-foreground">{t.text}</p>
              <p className="text-xs text-foreground-dim mt-0.5">
                {dateTime(t.at)}
                {t.by && t.by !== "system" && t.by !== "bot" && ` · ${t.by}`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-foreground-dim uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}
