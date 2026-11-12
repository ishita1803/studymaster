import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  Check,
  Flame,
  Layers,
  Play,
  Route,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { auth } from "@/auth";
import { Nova } from "@/components/nova";
import { ReadinessRing, WeeklyBars } from "@/components/ui";

export const metadata: Metadata = {
  title: "StudyMaster — your adaptive study planner",
};

const FEATURES = [
  {
    icon: Timer,
    tone: "mint",
    title: "Focus timer that counts",
    body: "25/5, 50/10 or your own rhythm. Minutes land on the right subject, and streaks only grow when you actually study.",
  },
  {
    icon: Route,
    tone: "violet",
    title: "Adaptive roadmap",
    body: "Topics spread across your real available hours. Miss a day and Nova quietly re-plans — the exam date never moves.",
  },
  {
    icon: BrainCircuit,
    tone: "pink",
    title: "Quizzes & mock tests",
    body: "Multiple choice, true/false and short answer, timed like the real thing, with instant explanations and topic accuracy.",
  },
  {
    icon: Layers,
    tone: "amber",
    title: "Cards that remember",
    body: "Rate a flashcard Easy, Medium or Hard. Shaky cards return sooner; solid ones drift further away.",
  },
  {
    icon: Sparkles,
    tone: "sky",
    title: "Gemini study sidekick",
    body: "Explain, summarise, generate practice and get hints before answers. Without a key, a friendly demo mode takes over.",
  },
  {
    icon: TrendingUp,
    tone: "mint",
    title: "Progress you can feel",
    body: "Readiness score, weekly hours, weak-topic radar, XP, badges and a weekly challenge — rewards tied to real learning.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Tell Nova what you're studying",
    body: "Subjects, topics, difficulty, exam dates and how many hours a day you really have.",
    icon: CalendarCheck,
  },
  {
    n: "02",
    title: "Get a living daily plan",
    body: "The roadmap prioritises hard and important topics, reserves revision days and reflows when life happens.",
    icon: Route,
  },
  {
    n: "03",
    title: "Study, test, repeat",
    body: "Focus sessions, quizzes and spaced repetition feed one readiness score — so you always know what to do next.",
    icon: Flame,
  },
] as const;

const TONES: Record<string, string> = {
  mint: "border-mint/25 bg-mint/10 text-mint",
  violet: "border-violet/25 bg-violet/10 text-violet",
  pink: "border-pink/25 bg-pink/10 text-pink",
  amber: "border-amber/25 bg-amber/10 text-amber",
  sky: "border-sky/25 bg-sky/10 text-sky",
};

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div className="relative">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Nova size={36} float={false} />
            <span className="flex flex-col leading-none">
              <span className="display text-xl font-bold tracking-tight text-cream">StudyMaster</span>
              <span className="text-[0.6rem] uppercase tracking-[0.24em] text-muted">
                study planner
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#features" className="transition hover:text-cream">
              Features
            </a>
            <a href="#how" className="transition hover:text-cream">
              How it works
            </a>
            <a href="#design" className="transition hover:text-cream">
              Design
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost btn-sm">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Start free
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 sm:pt-20">
          <div className="grid items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
            <div className="fade-up">
              <span className="chip chip-mint">
                <Sparkles size={13} />
                Twelve study tools, one calm dashboard
              </span>

              <h1 className="display mt-6 text-[2.9rem] font-semibold leading-[1.02] text-cream sm:text-6xl lg:text-[4.3rem]">
                Study smarter,
                <br />
                <span className="text-gradient">one small session</span>
                <br />
                at a time.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                StudyMaster turns your syllabus into a realistic plan — then keeps it alive when
                you miss a day. Focus, quiz, review and watch your exam readiness actually climb.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Start planning
                  <ArrowRight size={17} />
                </Link>
                <Link href="/login" className="btn btn-secondary btn-lg">
                  <Play size={15} />
                  Try the demo
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
                {[
                  "Adaptive rescheduling",
                  "Gemini tutor",
                  "Spaced repetition",
                  "No credit card",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check size={13} className="text-mint" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* product preview */}
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="absolute -inset-10 rounded-full bg-mint/10 blur-3xl" aria-hidden />
              <div className="glass-strong card relative rotate-[1.2deg] p-5 shadow-2xl sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">Today&apos;s plan</p>
                    <p className="display mt-1 text-lg font-semibold text-cream">
                      Good evening
                    </p>
                  </div>
                  <Nova size={48} mood="happy" />
                </div>

                <div className="mt-5 flex items-center gap-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <ReadinessRing value={78} size={104} label="ready" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <div className="flex justify-between text-[0.7rem] text-muted">
                        <span>Syllabus</span>
                        <span className="text-cream">64%</span>
                      </div>
                      <div className="progress-track mt-1.5 h-1.5">
                        <div className="progress-fill" style={{ width: "64%" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[0.7rem] text-muted">
                        <span>This week</span>
                        <span className="text-cream">7h 20m</span>
                      </div>
                      <div className="progress-track mt-1.5 h-1.5">
                        <div className="progress-fill" style={{ width: "72%" }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="chip chip-pink">
                        <Flame size={11} /> 6 day streak
                      </span>
                      <span className="chip chip-violet">
                        <Zap size={11} /> Lv 5
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    { title: "Cell division — mitosis", meta: "Biology · 40m", done: true },
                    { title: "Quadratic functions", meta: "Maths · 35m", done: false },
                    { title: "Revise: photosynthesis", meta: "Revision · 25m", done: false },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5"
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full border ${
                          item.done
                            ? "border-mint bg-mint text-ink"
                            : "border-white/20 text-transparent"
                        }`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xs font-semibold ${
                            item.done ? "text-muted line-through" : "text-cream"
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-[0.65rem] text-muted">{item.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[0.68rem] uppercase tracking-[0.16em] text-muted">
                      Focus minutes
                    </p>
                    <span className="text-[0.68rem] text-mint">+18% this week</span>
                  </div>
                  <WeeklyBars
                    data={[
                      { label: "M", minutes: 55 },
                      { label: "T", minutes: 80 },
                      { label: "W", minutes: 30 },
                      { label: "T", minutes: 95 },
                      { label: "F", minutes: 70 },
                      { label: "S", minutes: 40 },
                      { label: "S", minutes: 60 },
                    ]}
                  />
                </div>
              </div>

              <div className="glass card absolute -bottom-6 -left-4 hidden items-center gap-3 p-3 sm:flex lg:-left-10">
                <Nova size={38} mood="excited" />
                <div>
                  <p className="text-xs font-semibold text-cream">Nice work!</p>
                  <p className="text-[0.65rem] text-muted">+10 XP · 25 focused minutes</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- stats strip */}
        <section className="border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 sm:grid-cols-4">
            {[
              { value: "12", label: "connected study tools" },
              { value: "1", label: "living plan, not a static timetable" },
              { value: "3", label: "quiz formats with instant feedback" },
              { value: "∞", label: "second chances when you fall behind" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="display text-3xl font-semibold text-gradient-mint">{stat.value}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- features */}
        <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Everything in one place</p>
            <h2 className="display mt-3 text-3xl font-semibold text-cream sm:text-5xl">
              A whole study system,
              <span className="text-gradient-mint"> softly lit</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
              Not another timer with a to-do list. Every tool feeds the same brain: what you
              studied, what you forgot, and what deserves tomorrow&apos;s first hour.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="glass card card-hover neon-edge group relative overflow-hidden p-6"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-2xl border ${TONES[feature.tone]}`}
                  >
                    <Icon size={20} />
                  </span>
                  <h3 className="display mt-4 text-lg font-semibold text-cream">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
                  <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-mint/5 blur-2xl transition group-hover:bg-mint/10" />
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- how */}
        <section id="how" className="relative border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="eyebrow">How it works</p>
                <h2 className="display mt-3 text-3xl font-semibold text-cream sm:text-4xl">
                  Three steps to a
                  <span className="text-gradient"> calmer week</span>
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
                  StudyMaster does the tedious planning maths so you can spend your energy on the
                  actual learning. Change anything at any time — the plan reflows around you.
                </p>
                <div className="mt-8 hidden items-center gap-3 lg:flex">
                  <Nova size={56} mood="focused" />
                  <div className="glass card px-4 py-3">
                    <p className="text-xs text-muted">Nova says</p>
                    <p className="text-sm font-semibold text-cream">
                      &ldquo;Two revision days before your exam. I&apos;ve got you.&rdquo;
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.n}
                      className="glass card card-hover flex items-start gap-4 p-5 sm:p-6"
                    >
                      <span className="display text-2xl font-semibold text-white/20">{step.n}</span>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3 className="display text-base font-semibold text-cream">{step.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- design */}
        <section id="design" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="glass-strong card relative overflow-hidden p-8 sm:p-12">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-mint/15 blur-3xl" />

            <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="eyebrow">The design</p>
                <h2 className="display mt-3 text-3xl font-semibold text-cream sm:text-4xl">
                  Professional focus.
                  <span className="text-gradient-mint"> A little bit cute.</span>
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
                  Deep ink surfaces, mint and violet neon, soft glass cards, drifting particles
                  and Nova — a small star-blob who reacts to your streak. Quiet enough for long
                  study sessions, alive enough to make you want to come back.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Neon mint", "Electric violet", "Candy pink", "Warm cream", "Particle field"].map(
                    (tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center gap-6">
                <div className="glass card flex h-40 w-32 rotate-[-4deg] flex-col items-center justify-center gap-3 p-4">
                  <Nova size={58} mood="happy" />
                  <p className="text-center text-[0.68rem] text-muted">happy streak</p>
                </div>
                <div className="glass card flex h-48 w-36 rotate-[3deg] flex-col items-center justify-center gap-3 p-4">
                  <Nova size={76} mood="excited" />
                  <p className="text-center text-[0.68rem] text-muted">7 days strong</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- cta */}
        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="relative overflow-hidden rounded-[2rem] border border-mint/20 bg-gradient-to-br from-mint/12 via-violet/10 to-pink/10 p-8 text-center sm:p-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(91,240,200,0.18),transparent_60%)]" />
            <div className="relative">
              <div className="mx-auto mb-5 w-fit">
                <Nova size={72} mood="excited" />
              </div>
              <h2 className="display text-3xl font-semibold text-cream sm:text-5xl">
                Your exam is coming.
                <br />
                <span className="text-gradient">Let&apos;s make the days count.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm text-muted sm:text-base">
                Set up your first subject in under two minutes. StudyMaster handles the schedule,
                the revision timing and the gentle nudges.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Create your free account
                  <ArrowRight size={17} />
                </Link>
                <Link href="/login" className="btn btn-secondary btn-lg">
                  Explore the demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-xs text-muted">
          <div className="flex items-center gap-2">
            <Nova size={24} float={false} />
            <span>StudyMaster · built for curious minds</span>
          </div>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-cream">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-cream">
              Sign up
            </Link>
            <span>Local demo · SQLite</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
