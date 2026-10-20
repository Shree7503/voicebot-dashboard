/**
 * Browser side of sign-in. The session itself is an httpOnly cookie set by /api/auth/login;
 * proxy.ts sends anyone without a valid session to /login, so pages need no auth state.
 */

export async function signIn(password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null);
    return { ok: false, message: body?.error?.message ?? "Sign-in failed. Try again." };
  } catch {
    return { ok: false, message: "Can't reach the server. Check your connection and try again." };
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
