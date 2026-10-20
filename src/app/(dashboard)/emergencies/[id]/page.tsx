"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, dateTime, timeAgo, useApi, useNow } from "@/lib/api";
import type { CaseDetail, VerdictValue } from "@/lib/api-types";
import { CallerNumber, CredibilityText, ErrorBox, Loading, needsAction, PriorityBadge, StatusBadge, VerdictBadge } from "@/components/ui";
import { TranscriptPanel } from "@/components/transcript";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FLAG_LABELS: Record<string, string> = { injured: "Anyone injured", weapon: "Weapon", happeningNow: "Still happening", callerSafe: "Caller safe" };
const ANSWER: Record<string, string> = { yes: "Yes", no: "No", unknown: "Not known" };

/** One line of the case timeline, in plain words. */
function describe(event: CaseDetail["timeline"][number]): string {
  const d = event.data as Record<string, string | number | { level?: string } | undefined>;
  switch (event.kind) {
    case "created":
      return `Reported by the bot${d.priority ? ` as ${d.priority}` : ""}${d.station ? `, station ${d.station}` : ""}`;
    case "detail_added":
      return "More details added during the call";
    case "joined_incident":
    case "linked_report":
      return "Grouped with other reports of the same incident";
    case "alert_queued":
      return "WhatsApp alert queued";
    case "alert_sent":
      return "WhatsApp alert sent to the control room";
    case "alert_failed":
      return `WhatsApp alert failed${d.error ? `: ${d.error}` : ""}`;
    case "alert_resend":
      return "WhatsApp alert sent again";
    case "assessed":
    case "assessed_without_ai": {
      const level = typeof d.credibility === "object" ? d.credibility?.level : undefined;
      return `Call reviewed after it ended${level ? `: credibility ${level}` : ""}`;
    }
    case "acknowledged":
      return `Acknowledged${d.note ? `: ${d.note}` : ""}`;
    case "closed":
      return `Closed${d.note ? `: ${d.note}` : ""}`;
    case "verdict":
      return `Marked ${d.value}${d.note ? `: ${d.note}` : ""}`;
    default:
      return event.kind.replace(/_/g, " ");
  }
}

export default function EmergencyDetailPage(props: PageProps) {
  const { id } = use(props.params);
  const caseId = decodeURIComponent(id);
  const now = useNow();
  const { data: e, error, loading, reload, setData } = useApi<CaseDetail>(`/api/cases/${encodeURIComponent(caseId)}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (label: string, body: { action: "status"; status: "acknowledged" | "closed" } | { action: "verdict"; verdict: VerdictValue }) => {
    setBusy(label);
    setActionError(null);
    try {
      const updated = await api<CaseDetail>(`/api/cases/${encodeURIComponent(caseId)}`, { method: "PATCH", body });
      setData(() => updated);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const back = (
    <Link href="/emergencies" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors">
      ← Back to emergencies
    </Link>
  );

  if (!e) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl space-y-6">
        {back}
        {loading && <Loading label="Loading emergency…" />}
        {error && <ErrorBox message={error} onRetry={reload} />}
      </div>
    );
  }

  const button = "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl">
      <div className="flex items-center justify-between gap-4 mb-5">
        {back}
        {e.callId && (
          <Link
            href={`/calls/${encodeURIComponent(e.callId)}`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
          >
            Open the call →
          </Link>
        )}
      </div>

      <div className="mt-2 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <PriorityBadge priority={e.priority} />
          <span className="text-xs font-mono font-medium text-foreground-dim">{e.id}</span>
          <StatusBadge status={e.status} />
          <VerdictBadge verdict={e.verdict?.value ?? null} />
          <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
            {e.category.mr ? `${e.category.mr} · ${e.category.en}` : e.category.en}
          </span>
        </div>
        <h1 className="text-xl font-semibold text-foreground leading-relaxed">{e.details?.detailsMr ?? e.summary ?? e.category.en}</h1>
        {e.priorityReason && <p className="text-xs text-foreground-dim mt-1">Priority: {e.priorityReason}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3.5 rounded-xl border border-border bg-surface mb-6">
        {needsAction(e.status) && (
          <button disabled={busy !== null} onClick={() => act("ack", { action: "status", status: "acknowledged" })} className={`${button} bg-accent text-white font-semibold hover:bg-accent/90`}>
            {busy === "ack" ? "Acknowledging…" : "Acknowledge"}
          </button>
        )}
        {e.status !== "closed" && (
          <button
            disabled={busy !== null}
            onClick={() => act("close", { action: "status", status: "closed" })}
            className={`${button} border border-border bg-surface-raised text-foreground-muted hover:text-foreground`}
          >
            {busy === "close" ? "Closing…" : "Close"}
          </button>
        )}
        <div className="h-4 w-px bg-border mx-1" />
        {(["genuine", "hoax"] as const).map((v) => (
          <button
            key={v}
            disabled={busy !== null}
            onClick={() => act(v, { action: "verdict", verdict: v })}
            className={`${button} ${
              e.verdict?.value === v ? (v === "genuine" ? "bg-success text-white" : "bg-hoax text-white") : "border border-border text-foreground-dim hover:text-foreground"
            }`}
          >
            {busy === v ? "Saving…" : v === "genuine" ? "Genuine" : "Hoax"}
          </button>
        ))}
        {actionError && <span className="text-xs text-p1">{actionError}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-xl border border-border bg-surface mb-8">
        <Detail label="Place">
          {e.location.spoken ?? "Not given"}
          {e.location.english && e.location.english !== e.location.spoken && <span className="text-foreground-dim"> ({e.location.english})</span>}
        </Detail>
        <Detail label="Police station">
          {e.station?.name ?? "Not found"}
          {e.station?.phone && (
            <a href={`tel:${e.station.phone}`} className="ml-2 text-accent underline font-mono text-xs">
              {e.station.phone}
            </a>
          )}
        </Detail>
        <Detail label="Caller">
          <CallerNumber masked={e.caller} revealPath={`/api/cases/${encodeURIComponent(e.id)}/caller`} />
        </Detail>
        <Detail label="Credibility">
          <CredibilityText level={e.credibility?.level ?? null} />
          {e.credibility?.reasons?.length ? <span className="block text-xs text-foreground-dim mt-1">{e.credibility.reasons.join(" · ")}</span> : null}
        </Detail>
        <Detail label="Reported">
          {dateTime(e.createdAt)} <span className="text-foreground-dim">({timeAgo(e.createdAt, now)})</span>
        </Detail>
        <Detail label="What the caller said">
          {Object.entries(FLAG_LABELS).map(([key, label]) => (
            <span key={key} className="block text-xs">
              {label}: <span className={e.flags[key as keyof typeof e.flags] === "yes" ? "text-p1 font-semibold" : ""}>{ANSWER[e.flags[key as keyof typeof e.flags] ?? "unknown"]}</span>
            </span>
          ))}
        </Detail>
        {e.incident && e.incident.reports > 1 && (
          <Detail label="Same incident">
            {e.incident.reports} reports:{" "}
            {e.incident.caseIds.map((other) => (
              <Link key={other} href={`/emergencies/${encodeURIComponent(other)}`} className="mr-2 font-mono text-accent underline text-xs">
                {other}
              </Link>
            ))}
          </Detail>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-4">Timeline</h2>
        <div className="relative pl-6 border-l-2 border-border space-y-4">
          {e.timeline.map((t, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" />
              <p className="text-sm font-medium text-foreground">{describe(t)}</p>
              <p className="text-xs text-foreground-dim mt-0.5">
                {dateTime(t.at)}
                {t.by && t.by !== "system" && ` · ${t.by}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Call transcript</h2>
        {e.callId ? <TranscriptPanel callId={e.callId} /> : <p className="text-sm text-foreground-dim">This emergency has no linked call.</p>}
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
