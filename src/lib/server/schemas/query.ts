import { ApiError } from "../errors";

export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 92;

export interface DateRange {
  /** inclusive, UTC instant of 00:00 IST on the first day */
  from: Date;
  /** exclusive, UTC instant of 00:00 IST on the day after the last day */
  to: Date;
  /** YYYY-MM-DD in IST, as given */
  fromDay: string;
  toDay: string;
}

function istMidnight(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utc = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(utc) || new Date(utc).toISOString().slice(0, 10) !== day) return null;
  return new Date(utc - IST_OFFSET_MS);
}

export function istDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD, both inclusive, as days in India time. Defaults to the
 * last 7 days including today.
 */
export function parseRange(params: URLSearchParams, now = new Date()): DateRange {
  const today = istDay(now);
  const toDay = params.get("to") || today;
  const toStart = istMidnight(toDay);
  if (!toStart) throw new ApiError(400, "bad_range", "Use dates like 2026-10-01 for from and to.");
  const fromDay = params.get("from") || istDay(new Date(toStart.getTime() - 6 * DAY_MS));
  const from = istMidnight(fromDay);
  if (!from) throw new ApiError(400, "bad_range", "Use dates like 2026-10-01 for from and to.");
  const to = new Date(toStart.getTime() + DAY_MS);
  if (from >= to) throw new ApiError(400, "bad_range", "The start date must be on or before the end date.");
  if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new ApiError(400, "bad_range", `Pick a range of ${MAX_RANGE_DAYS} days or less.`);
  }
  return { from, to, fromDay, toDay };
}

/** Every IST day in the range, for filling gaps in per-day series with zeros. */
export function daysIn(range: DateRange): string[] {
  const days: string[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) days.push(istDay(new Date(t)));
  return days;
}

export function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, "bad_param", `${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}
