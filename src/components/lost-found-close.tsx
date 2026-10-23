"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LostFoundDetail } from "@/lib/api-types";

/**
 * Close a lost-and-found report: "Returned to owner" (the default) or closed for another
 * reason, with an optional note, and optionally the matched report too. Asks before it acts,
 * because a closed report leaves the open list.
 */
export function CloseLostFound({
  id,
  matches = [],
  onClosed,
  compact = false,
}: {
  id: string;
  /** suggested matches, best first; one of them can be closed together with this report */
  matches?: { id: string; open: boolean | null; score?: number | null; strong?: boolean }[];
  onClosed: (updated: LostFoundDetail) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // focus the first choice when the dialog opens, for keyboard users
  const [reason, setReason] = useState<"returned" | "closed">("returned");
  const [note, setNote] = useState("");
  const candidates = matches.filter((m) => m.open !== false);
  // with one possible match, offer it ticked; with several, let the officer pick
  const [alsoClose, setAlsoClose] = useState<string>(candidates.length === 1 ? candidates[0].id : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<LostFoundDetail>(`/api/lost-found/${encodeURIComponent(id)}/close`, {
        method: "POST",
        body: { reason, note, ...(alsoClose ? { alsoClose } : {}) },
      });
      setOpen(false);
      onClosed(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`rounded-lg bg-accent text-white font-semibold hover:bg-accent-dim transition-colors ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
      >
        Close
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 space-y-3 text-left shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Close ${id}`}
      >
        <p className="text-sm font-semibold text-foreground">Close {id}</p>
        <fieldset className="flex flex-wrap gap-4 text-sm text-foreground">
          <legend className="sr-only">Why is it closing?</legend>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input autoFocus type="radio" name={`reason-${id}`} checked={reason === "returned"} onChange={() => setReason("returned")} className="accent-accent" />
            Returned to owner
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="radio" name={`reason-${id}`} checked={reason === "closed"} onChange={() => setReason("closed")} className="accent-accent" />
            Closed for another reason
          </label>
        </fieldset>
        <label className="block">
          <span className="block text-xs text-foreground-muted mb-1">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder={reason === "returned" ? "e.g. Owner collected it at the station" : "Why it is being closed"}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder-foreground-dim outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>
        {candidates.length === 1 && (
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={alsoClose === candidates[0].id}
              onChange={(e) => setAlsoClose(e.target.checked ? candidates[0].id : "")}
              className="accent-accent"
            />
            Also close the matched report {candidates[0].id}
          </label>
        )}
        {candidates.length > 1 && (
          <label className="block">
            <span className="block text-xs text-foreground-muted mb-1">Also close a matched report</span>
            <select
              value={alsoClose}
              onChange={(e) => setAlsoClose(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">No, only {id}</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {typeof m.score === "number" ? ` (score ${m.score}${m.strong ? ", strong" : ""})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="text-xs text-p1" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button disabled={busy} onClick={submit} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50">
            {busy ? "Closing…" : reason === "returned" ? "Close as returned" : "Close report"}
          </button>
          <button
            disabled={busy}
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
