import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./roles";

/**
 * One account: the police control room. Its password hash is DASHBOARD_PASSWORD_HASH in .env;
 * there is no user database. Sessions are HS256 JWTs in an httpOnly cookie, carrying a
 * fingerprint of the password hash, so changing the password signs every session out.
 *
 * Free of database and "server-only" imports so proxy.ts can use it.
 */

export const SESSION_COOKIE = "rakshak_session";
export const ACCOUNT_ID = "control-room";
const ISSUER = "rakshak-dashboard";
const AUDIENCE = "rakshak-dashboard";

export interface Account {
  id: string;
  name: string;
  /** the single account sees and does everything; roles can be added later */
  role: Role;
}

export interface AuthSettings {
  passwordHash: string;
  secret: string;
  name: string;
  sessionHours: number;
}

/** The settings from .env, or the name of the first one that is missing or unusable. */
export function authSettings(source: Record<string, string | undefined> = process.env): AuthSettings | { missing: string } {
  const passwordHash = source.DASHBOARD_PASSWORD_HASH?.trim();
  const secret = source.DASHBOARD_JWT_SECRET?.trim();
  if (!passwordHash) return { missing: "DASHBOARD_PASSWORD_HASH" };
  if (!secret || secret.length < 32) return { missing: "DASHBOARD_JWT_SECRET (at least 32 characters)" };
  return {
    passwordHash,
    secret,
    name: source.DASHBOARD_ACCOUNT_NAME?.trim() || "Police control room",
    sessionHours: Number(source.DASHBOARD_SESSION_HOURS) || 8,
  };
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** A short, non-reversible fingerprint of the password hash. */
async function passwordVersion(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash));
  return Buffer.from(digest).toString("base64url").slice(0, 22);
}

export async function signSession(settings: AuthSettings): Promise<string> {
  return new SignJWT({ pv: await passwordVersion(settings.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ACCOUNT_ID)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${settings.sessionHours}h`)
    .sign(key(settings.secret));
}

/** The account for a valid, unexpired token issued under the current password, or null. Never throws. */
export async function verifySession(token: string | undefined, settings: AuthSettings): Promise<Account | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(settings.secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (payload.sub !== ACCOUNT_ID || payload.pv !== (await passwordVersion(settings.passwordHash))) return null;
    return { id: ACCOUNT_ID, name: settings.name, role: "admin" };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}
