"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const result = await signIn(email, password);
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
        <label htmlFor="login-email" className="block text-sm font-medium text-foreground-muted mb-1.5">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Control room email"
          autoFocus
          required
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder-foreground-dim outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
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
        disabled={isSubmitting || !email.trim() || !password}
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
          <Image
            src="/logo.png"
            alt="Maharashtra Police emblem"
            width={367}
            height={271}
            priority
            className="mx-auto mb-4 h-24 w-auto"
          />
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
