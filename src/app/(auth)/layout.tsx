import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Nova } from "@/components/nova";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[1.02fr_0.98fr]">
      <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:px-14">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <Nova size={38} float={false} />
          <span className="flex flex-col leading-none">
            <span className="display text-xl font-bold tracking-tight text-cream">StudyMaster</span>
            <span className="text-[0.6rem] uppercase tracking-[0.24em] text-muted">
              study planner
            </span>
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <p className="text-center text-[0.7rem] text-muted">
          Local-first demo · your data stays in a SQLite file on this machine
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-white/5 lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-mint/10 via-violet/10 to-pink/10" />
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-mint/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-violet/25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Sparkles size={14} className="text-mint" />
            A softer way to study
          </div>

          <div className="max-w-sm">
            <div className="mb-8 flex items-end gap-4">
              <Nova size={104} mood="happy" />
              <div className="glass card mb-4 rounded-2xl rounded-bl-md px-4 py-3">
                <p className="text-sm text-cream">
                  &ldquo;You don&apos;t need more willpower. You need a plan that bends.&rdquo;
                </p>
              </div>
            </div>
            <h2 className="display text-4xl font-semibold leading-tight text-cream">
              Study like it&apos;s a system,{" "}
              <span className="text-gradient-mint">not a scramble.</span>
            </h2>
            <ul className="mt-7 space-y-3 text-sm text-muted">
              {[
                "A roadmap that re-plans when you miss a day",
                "Quizzes that reveal your weak topics",
                "Flashcards that come back at the right time",
                "A Gemini tutor that hints before it answers",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-mint/20 text-mint">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="chip chip-mint">✦ XP for real learning only</span>
            <span className="chip">Particles included</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
