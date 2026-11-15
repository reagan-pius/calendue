"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Spec: "Auth: bare white canvas, wordmark, Supabase auth fields / magic
// link, one accent CTA." Mode D6: password AND magic link.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [magic, setMagic] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") !== "auth") {
      return;
    }
    queueMicrotask(() => {
      setError("Sign-in link expired or invalid. Try again.");
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    try {
      if (magic) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (otpError) throw otpError;
        setMessage("Check your email for a magic link.");
        return;
      }

      if (mode === "signup") {
        const { data, error: signError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signError) throw signError;
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setMessage("Check your email to confirm your account.");
        }
        return;
      }

      const { error: inError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (inError) throw inError;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const cta = busy
    ? "Working…"
    : magic
      ? "Send magic link"
      : mode === "signup"
        ? "Create account"
        : "Sign in";

  const inputCls =
    "w-full rounded-[6px] border border-hairline bg-white px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        <h1 className="text-center text-2xl font-medium tracking-tight text-balance">
          Calendue
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-muted">
          Paste deadlines. Get a clean calendar.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="sr-only" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="university@email…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          {!magic && (
            <div>
              <label className="sr-only" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Password…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-press mt-1 rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {cta}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-xs text-[#DC2626]" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
            {message}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between text-xs text-muted">
          <button
            type="button"
            onClick={() => setMagic(!magic)}
            className="underline-offset-2 hover:text-ink hover:underline"
          >
            {magic ? "Use password" : "Email me a magic link"}
          </button>
          {!magic && (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="underline-offset-2 hover:text-ink hover:underline"
            >
              {mode === "signin" ? "Create account" : "Sign in instead"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
