"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Lock, Mail, Play, Sparkles } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [demoPending, setDemoPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });

    if (result?.error) {
      setError("That email and password don't match. Try again?");
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleDemo() {
    setError(null);
    setDemoPending(true);
    const result = await signIn("credentials", {
      email: "demo@studymaster.app",
      password: "demo1234",
      redirect: false,
    });

    if (result?.error) {
      setError("Demo account not found. Run `npm run db:seed` first.");
      setDemoPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="fade-up">
      <span className="chip chip-mint">
        <Sparkles size={13} />
        Welcome back
      </span>
      <h1 className="display mt-5 text-4xl font-semibold text-cream">Pick up where you left off</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Your roadmap, cards and streak are waiting. Nova kept the lights on.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="input pl-11"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="input pl-11"
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-xs text-pink">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : null}
          {pending ? "Opening your planner…" : "Log in"}
          {!pending ? <ArrowRight size={16} /> : null}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[0.68rem] uppercase tracking-[0.16em] text-muted">
        <span className="h-px flex-1 bg-white/8" />
        or
        <span className="h-px flex-1 bg-white/8" />
      </div>

      <button
        type="button"
        onClick={handleDemo}
        disabled={demoPending}
        className="btn btn-secondary w-full"
      >
        {demoPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
        Try demo
      </button>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[0.7rem] text-muted">
        <span className="font-semibold text-cream">Try demo</span> opens a fully
        populated planner (Aarav's subjects, syllabus, notes, exams) —
        demo@studymaster.app / demo1234
      </div>

      <p className="mt-7 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-mint hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
