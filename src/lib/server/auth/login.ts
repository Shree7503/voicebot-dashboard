import "server-only";

import { ApiError } from "../errors";
import { verifyPassword } from "./password";
import { authSettings, normaliseEmail, signSession, type AuthSettings } from "./session";

// Failed sign-ins per IP address, per server process. Enough for one dashboard instance;
// use a shared store if it is ever scaled out.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function checkLimit(key: string) {
  const entry = failures.get(key);
  if (!entry) return;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return;
  }
  if (entry.count >= MAX_FAILURES) {
    const minutes = Math.ceil((entry.first + WINDOW_MS - Date.now()) / 60000);
    throw new ApiError(429, "too_many_attempts", `Too many wrong passwords. Try again in ${minutes} minutes.`);
  }
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else entry.count += 1;
}

export function requireAuthSettings(): AuthSettings {
  const settings = authSettings();
  if ("missing" in settings) {
    throw new ApiError(503, "not_configured", `Sign-in is not set up: ${settings.missing} is missing from .env.`);
  }
  return settings;
}

/** Checks the control room email and password; returns a session token. */
export async function login(email: string, password: string, ip: string | null): Promise<{ token: string; settings: AuthSettings }> {
  const settings = requireAuthSettings();
  const key = ip ?? "unknown";
  checkLimit(key);
  // the password is always checked, so a wrong email takes as long as a wrong password
  const passwordOk = await verifyPassword(password, settings.passwordHash);
  if (!passwordOk || normaliseEmail(email) !== settings.email) {
    recordFailure(key);
    // never says which of the two was wrong
    throw new ApiError(401, "bad_credentials", "That email and password don't match. Try again.");
  }
  failures.delete(key);
  return { token: await signSession(settings), settings };
}

/** For tests. */
export function resetLoginLimiter() {
  failures.clear();
}
