"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Transcript } from "@/lib/api-types";
import { ErrorBox, Loading } from "./ui";

/**
 * The call's conversation, loaded only when someone opens it: every view is written to the
 * audit log, so it is never fetched just because a page was visited.
 */
export function TranscriptPanel({ callId }: { callId: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Transcript | null }>({ loading: false, error: null, data: null });

  const open = async () => {
    setState({ loading: true, error: null, data: null });
    try {
      setState({ loading: false, error: null, data: await api<Transcript>(`/api/calls/${encodeURIComponent(callId)}/transcript`) });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message, data: null });
    }
  };

  if (!state.data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        {state.error && (
          <div className="mb-3">
            <ErrorBox message={state.error} />
          </div>
        )}
        {state.loading ? (
          <Loading label="Loading transcript…" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-foreground-dim">Opening the transcript is recorded in the audit log.</p>
            <button onClick={open} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90">
              Open transcript
            </button>
          </div>
        )}
      </div>
    );
  }

  const { data } = state;
  if (!data.available) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-foreground-dim">
        No transcript is stored for this call. Transcripts are deleted after the retention period.
      </div>
    );
  }
  if (data.turns.length === 0) {
    return <div className="rounded-xl border border-border bg-surface p-5 text-sm text-foreground-dim">The caller&apos;s speech was not recognised in this call.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3 text-sm leading-relaxed">
      {data.turns.map((turn, i) =>
        turn.speaker === "tool" ? (
          <p key={i} className="text-[11px] text-foreground-dim font-mono text-center">
            ⚙ bot used: {turn.text}
          </p>
        ) : (
          <div
            key={i}
            className={`p-3 rounded-lg border ${turn.speaker === "bot" ? "bg-surface-raised/50 border-border/80 text-foreground" : "bg-surface border-border/40 text-foreground-muted"}`}
          >
            <span className={`text-xs font-semibold block mb-1 ${turn.speaker === "bot" ? "text-accent" : "text-foreground-dim"}`}>
              {turn.speaker === "bot" ? "RakshakAI bot" : "Caller"}
            </span>
            <p className="whitespace-pre-wrap">{turn.text}</p>
          </div>
        ),
      )}
      <p className="text-[11px] text-foreground-dim pt-1">
        Long numbers the caller said (phone, Aadhaar, account) were removed before storage.
        {data.expiresAt && ` Stored until ${new Date(data.expiresAt).toLocaleDateString("en-IN")}.`}
      </p>
    </div>
  );
}
