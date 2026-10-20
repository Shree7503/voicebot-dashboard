import "server-only";

import { env } from "../env";
import { ApiError } from "../errors";

/**
 * Lost and found, from the bot's read-only API (docs/bot-api-contract.md). The dashboard shows
 * figures and statuses only: whatever else the API sends (names, descriptions, phone numbers)
 * is dropped here and never reaches a browser.
 */

export const LOST_FOUND_STATUSES = ["open", "suggested", "reunited", "closed"] as const;
export type LostFoundStatus = (typeof LOST_FOUND_STATUSES)[number];

const TIMEOUT_MS = 8000;

async function call(path: string, params: URLSearchParams): Promise<unknown> {
  const base = env.lostFoundApiUrl;
  const token = env.botApiToken;
  if (!base || !token) {
    throw new ApiError(503, "not_connected", "Lost and found isn't connected yet: the bot's lost-and-found API is not set up.");
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(502, "bot_unreachable", "The bot's lost-and-found service is not answering. Try again in a minute.");
  }
  if (!response.ok) {
    console.error(`[lost-found] ${path} answered ${response.status}`);
    throw new ApiError(502, "bot_error", "The bot's lost-and-found service returned an error. Try again in a minute.");
  }
  return response.json();
}

function status(value: unknown): LostFoundStatus | "unknown" {
  return (LOST_FOUND_STATUSES as readonly unknown[]).includes(value) ? (value as LostFoundStatus) : "unknown";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value.slice(0, 200) : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

/** Counts per status, and reported / reunited per day. */
export async function lostFoundStats(from: string, to: string) {
  const body = (await call("/lost-found/stats", new URLSearchParams({ from, to }))) as {
    byStatus?: Record<string, unknown>;
    perDay?: { day?: unknown; reported?: unknown; reunited?: unknown }[];
  };
  return {
    byStatus: Object.fromEntries(LOST_FOUND_STATUSES.map((s) => [s, count(body.byStatus?.[s])])) as Record<LostFoundStatus, number>,
    perDay: (body.perDay ?? [])
      .filter((d) => typeof d.day === "string")
      .map((d) => ({ day: String(d.day), reported: count(d.reported), reunited: count(d.reunited) })),
  };
}

/** Reports as reference, status, station and dates: nothing else. */
export async function lostFoundList(query: { status?: LostFoundStatus; from: string; to: string; limit: number; before?: string }) {
  const params = new URLSearchParams({ from: query.from, to: query.to, limit: String(query.limit) });
  if (query.status) params.set("status", query.status);
  if (query.before) params.set("before", query.before);
  const body = (await call("/lost-found", params)) as { items?: Record<string, unknown>[]; nextBefore?: unknown };
  return {
    items: (body.items ?? []).map((item) => ({
      id: text(item.id) ?? "?",
      status: status(item.status),
      station: text(typeof item.station === "object" && item.station ? (item.station as { name?: unknown }).name : item.station),
      reportedAt: text(item.reportedAt),
      updatedAt: text(item.updatedAt),
    })),
    nextBefore: text(body.nextBefore),
  };
}
