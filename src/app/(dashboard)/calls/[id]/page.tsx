"use client";

import { use } from "react";
import Link from "next/link";
import { dateTime, duration, languageName, useApi } from "@/lib/api";
import type { CallDetail } from "@/lib/api-types";
import { CallerNumber, ErrorBox, Loading } from "@/components/ui";
import { TranscriptPanel } from "@/components/transcript";

interface PageProps {
  params: Promise<{ id: string }>;
}

const OUTCOME_LABEL = { completed: "Completed", short: "Hung up early", no_speech: "No speech recognised" } as const;

export default function CallDetailPage(props: PageProps) {
  const { id } = use(props.params);
  const callId = decodeURIComponent(id);
  const { data: call, error, loading, reload } = useApi<CallDetail>(`/api/calls/${encodeURIComponent(callId)}`);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl">
      <Link href="/calls" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6">
        ← Back to calls
      </Link>

      {loading && !call && <Loading label="Loading call…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {call && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <span className="text-xs font-mono font-medium text-foreground-dim bg-surface-raised px-2.5 py-1 rounded">{call.id}</span>
                {call.topics.map((t) => (
                  <span key={t} className="rounded-md bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {t}
                  </span>
                ))}
              </div>
              <h1 className={`text-xl font-semibold leading-snug ${call.summary ? "text-foreground" : "text-foreground-dim"}`}>
                {call.summary ?? (call.processing === "summarised" ? "No summary for this call" : call.processing === "failed" ? "The summary failed; the bot retries it" : "The summary is not ready yet")}
              </h1>
            </div>
            {call.cases.map((c) => (
              <Link
                key={c.id}
                href={`/emergencies/${encodeURIComponent(c.id)}`}
                className="inline-flex items-center gap-2 rounded-xl border border-p1/30 bg-p1-bg px-4 py-2 text-xs font-medium text-p1 hover:border-p1 transition-colors self-start shrink-0"
              >
                <span className="flex h-2 w-2 rounded-full bg-p1" />
                Emergency {c.id} ({c.priority}) →
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-border bg-surface mb-8">
            <Meta label="Time">{dateTime(call.startedAt)}</Meta>
            <Meta label="Length">{duration(call.durationSec)}</Meta>
            <Meta label="Language">{languageName(call.language)}</Meta>
            <Meta label="Caller">
              <CallerNumber masked={call.caller} revealPath={`/api/calls/${encodeURIComponent(call.id)}/caller`} />
            </Meta>
            <Meta label="How it ended">{OUTCOME_LABEL[call.outcome]}</Meta>
            <Meta label="Turns">
              {call.turns.caller} caller · {call.turns.bot} bot
            </Meta>
          </div>

          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">Transcript</h2>
            <TranscriptPanel callId={call.id} />
          </section>
        </>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-foreground-dim uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}
