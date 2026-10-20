"use client";

import { setDataEnv, useDataEnv } from "@/lib/api";

/** Live phone calls, or the browser test page's traffic (kept apart by the bot). */
export function DataSourceSwitch() {
  const dataEnv = useDataEnv();
  return (
    <div className="px-1">
      <p className="text-[11px] text-foreground-dim mb-1.5 px-2">Showing</p>
      <div className="grid grid-cols-2 rounded-lg border border-border bg-surface-raised p-0.5" role="radiogroup" aria-label="Which calls to show">
        {(
          [
            ["prod", "Live calls"],
            ["test", "Test page"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={dataEnv === value}
            onClick={() => setDataEnv(value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              dataEnv === value ? (value === "test" ? "bg-p2 text-white" : "bg-accent text-white") : "text-foreground-dim hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A strip across the page while test data is shown, so it is never mistaken for real calls. */
export function TestDataBanner() {
  const dataEnv = useDataEnv();
  if (dataEnv !== "test") return null;
  return (
    <div className="bg-p2-bg border-b border-p2/40 px-4 py-2 text-xs font-medium text-p2 text-center">
      Showing test page calls, not real ones.{" "}
      <button onClick={() => setDataEnv("prod")} className="underline font-semibold">
        Switch to live calls
      </button>
    </div>
  );
}
