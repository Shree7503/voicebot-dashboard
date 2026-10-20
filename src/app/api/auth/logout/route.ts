import { clearedSessionCookie } from "@/lib/server/auth/session";

/** Clears the session cookie. Works with or without a valid session. */
export async function POST() {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", clearedSessionCookie());
  return response;
}
