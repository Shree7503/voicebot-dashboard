import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashes as "scrypt:N:r:p:salt:hash" (salt and hash in base64url). Built on Node's
 * scrypt, so there is no native dependency. scripts/dashboard-admin.mjs writes the same format.
 * No "$" anywhere: Next.js expands "$NAME" inside .env values.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 12;
const PASSPHRASE_LENGTH = 16;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P);
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True for a value hashPassword could have produced. */
export function isPasswordHash(value: string): boolean {
  return /^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/.test(value.trim());
}

/**
 * Why a password is too weak for the control room account, or null if it is fine: 16 or
 * more characters in any script (a Marathi passphrase is fine), or 12 to 15 characters
 * using at least three of lowercase, uppercase, digits and symbols.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if ([...password].length >= PASSPHRASE_LENGTH) return null; // long passphrases, in any script
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (kinds < 3) return "Mix at least three of: lowercase letters, capitals, digits and symbols.";
  return null;
}
