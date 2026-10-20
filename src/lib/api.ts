"use client";

import { useCallback, useEffect, useState } from "react";

/** Browser side of the dashboard API: JSON requests and a hook for loading data into a page. */

// ------------------------------------------------------------------ requests

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (response.status === 401) {
    const next = window.location.pathname + window.location.search;
    // a full page load on purpose: drops every bit of client state from the ended session
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?expired=1&next=${encodeURIComponent(next)}`);
    throw new ApiRequestError(401, "Your session has ended. Sign in again.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(response.status, body?.error?.message ?? "The server could not complete this request.", body?.error?.code ?? null);
  }
  return body as T;
}

/** Loads `path` (null: wait), and again every `refreshMs` if given. */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [state, setState] = useState<{ data: T | null; error: string | null; errorCode: string | null; loading: boolean; key: string | null }>({
    data: null,
    error: null,
    errorCode: null,
    loading: path !== null,
    key: null,
  });
  const key = path;

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const data = await api<T>(path);
      setState({ data, error: null, errorCode: null, loading: false, key });
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.code : null;
      setState((prev) => ({ ...prev, error: (error as Error).message, errorCode: code, loading: false, key }));
    }
  }, [path, key]);

  useEffect(() => {
    let active = true;
    const run = () => active && load();
    void run();
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [load, refreshMs]);

  // data from another path is never shown as if it belonged to this one
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    errorCode: current ? state.errorCode : null,
    loading: path !== null && (!current || state.loading),
    reload: load,
    setData: (update: (data: T) => T) => setState((prev) => (prev.data ? { ...prev, data: update(prev.data) } : prev)),
  };
}

// ------------------------------------------------------------------ formatting

/** YYYY-MM-DD in India time, `days` ago (0 = today). */
export function istDay(daysAgo = 0): string {
  return new Date(Date.now() + 330 * 60000 - daysAgo * 86400000).toISOString().slice(0, 10);
}

/** The widest window the API allows (92 days, inclusive). */
export const LAST_90_DAYS = () => `from=${istDay(91)}&to=${istDay(0)}`;

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function languageName(code: string | null): string {
  if (!code) return "Not detected";
  return code.charAt(0).toUpperCase() + code.slice(1);
}

/** A clock that ticks every `ms`, for "time since reported" labels. */
export function useNow(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
