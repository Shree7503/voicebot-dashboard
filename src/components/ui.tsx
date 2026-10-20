"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { CaseStatus, Priority, VerdictValue } from "@/lib/api-types";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles: Record<Priority, string> = {
    P1: "bg-p1-bg text-p1 border-p1/40",
    P2: "bg-p2-bg text-p2 border-p2/40",
    P3: "bg-p3-bg text-p3 border-p3/40",
    P4: "bg-p3-bg text-p3 border-p3/40",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold ${styles[priority] ?? styles.P3}`}>
      {priority === "P1" && <span className="h-2 w-2 rounded-full bg-p1" />}
      {priority}
    </span>
  );
}

const STATUS_LABEL: Record<CaseStatus, string> = {
  new: "New",
  alerted: "Alert sent",
  acknowledged: "Acknowledged",
  closed: "Closed",
};

/** new and alerted both still wait for the control room to acknowledge. */
export function needsAction(status: CaseStatus) {
  return status === "new" || status === "alerted";
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const style = needsAction(status)
    ? "bg-p1/10 text-p1 font-bold"
    : status === "acknowledged"
      ? "bg-accent/15 text-accent font-semibold"
      : "bg-surface-raised text-foreground-dim";
  return <span className={`rounded-md px-2 py-0.5 text-xs ${style}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function VerdictBadge({ verdict }: { verdict: VerdictValue | null }) {
  if (verdict === "genuine") return <span className="rounded-md bg-success/15 text-success px-2 py-0.5 text-xs font-medium">✓ Genuine</span>;
  if (verdict === "hoax") return <span className="rounded-md bg-p1/15 text-p1 px-2 py-0.5 text-xs font-medium">✗ Hoax</span>;
  if (verdict === "unverifiable") return <span className="rounded-md bg-surface-raised text-foreground-dim px-2 py-0.5 text-xs font-medium">Unverifiable</span>;
  return null;
}

export function CredibilityText({ level }: { level: string | null }) {
  if (!level) return <span className="text-foreground-dim">Not assessed yet</span>;
  const style = level === "high" ? "text-success" : level === "medium" ? "text-p2" : "text-p1";
  return <span className={`font-semibold ${style}`}>{level.charAt(0).toUpperCase() + level.slice(1)}</span>;
}

/**
 * A masked caller number that shows the full number when clicked. Each reveal is a request
 * the server writes to the audit log.
 */
export function CallerNumber({ masked, revealPath, className = "" }: { masked: string | null; revealPath: string; className?: string }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!masked) return <span className="text-foreground-dim">Number not known</span>;

  const toggle = async () => {
    if (full) return setFull(null);
    setBusy(true);
    setError(null);
    try {
      const { phone } = await api<{ phone: string | null }>(revealPath, { method: "POST" });
      setFull(phone ?? "Number not known");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="font-mono hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1"
        title={full ? "Hide the number" : "Show the full number (recorded in the audit log)"}
      >
        📞 {full ? <a href={`tel:${full}`} className="underline">{full}</a> : masked}
        <span className="text-[10px] text-foreground-dim underline">{busy ? "…" : full ? "(hide)" : "(show)"}</span>
      </button>
      {error && <span className="text-[11px] text-p1">{error}</span>}
    </span>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-foreground-dim" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground-dim border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-p1/30 bg-p1-bg px-5 py-4 text-sm text-foreground flex flex-wrap items-center justify-between gap-3" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold text-p1 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center py-16 text-foreground-dim text-sm rounded-xl border border-border bg-surface">{children}</div>;
}
