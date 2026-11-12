"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCcw, Sparkles } from "lucide-react";

/**
 * Friendly fallback for unexpected client/server exceptions.
 * Without this, Next.js shows the bare "Application error: a client-side
 * exception has occurred" screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[studymaster] Route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center px-5 py-16">
      <div className="glass card w-full space-y-5 p-7 text-center sm:p-9">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-lilac/30 bg-lilac/10 text-lilac">
          <Sparkles size={26} />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Something wobbled
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Nova hit an unexpected snag. Your saved notes, plan and progress are safe — try
            again, and if it keeps happening go back to the dashboard.
          </p>
        </div>

        {error.digest ? (
          <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-[0.65rem] text-muted">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCcw size={15} />
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            <Home size={15} />
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
