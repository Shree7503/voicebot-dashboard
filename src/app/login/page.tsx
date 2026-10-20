"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth";

/** Only same-site paths, so ?next= can't send someone to another website after sign-in. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const result = await signIn(password);
    if (result.ok) {
      router.replace(safeNext(params.get("next")));
      router.refresh();
      return;
    }
    setError(result.message);
    setPassword("");
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {expired && !error && (
        <p className="text-sm text-foreground-muted" role="status">
          Your session ended. Sign in again.
        </p>
      )}
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-foreground-muted mb-1.5">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter control room password"
          autoFocus
          required
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder-foreground-dim outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && (
        <p className="text-sm text-p1" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !password}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised border border-border">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-accent" stroke="currentColor" strokeWidth="1.5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground">RakshakAI</h1>
          <p className="mt-1 text-sm text-foreground-muted">Police Control Room</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-foreground-dim">Authorized personnel only</p>
      </div>
    </div>
  );
}
