import type { Metadata } from "next";
import Link from "next/link";
import {
  BrainCircuit,
  Database,
  Flame,
  Info,
  KeyRound,
  Layers,
  Mail,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/gemini";
import { levelInfo } from "@/lib/gamification";
import { ProfileForm, PasswordForm } from "@/components/settings/settings-forms";
import { Card, PageHeader } from "@/components/ui";
import { Nova } from "@/components/nova";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUserId();

  const [user, subjects, topics, cards, quizzes, notes, focusCount, badges] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.subject.count({ where: { userId } }),
    prisma.topic.count({ where: { userId } }),
    prisma.flashcard.count({ where: { userId } }),
    prisma.quiz.count({ where: { userId } }),
    prisma.note.count({ where: { userId } }),
    prisma.focusSession.count({ where: { userId, completed: true } }),
    prisma.userAchievement.count({ where: { userId } }),
  ]);

  const level = levelInfo(user.xp);

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Tune your study system"
        description="Set your daily target, keep your account safe, and see what Nova is working with."
        action={
          <span className="chip chip-mint">
            <ShieldCheck size={12} />
            Local demo account
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <ProfileForm
              name={user.name}
              email={user.email}
              dailyStudyHours={user.dailyStudyHours}
              studyStartTime={user.studyStartTime}
              reminderEnabled={user.reminderEnabled}
            />
          </Card>

          <Card className="p-5 sm:p-6">
            <PasswordForm />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="relative overflow-hidden p-5">
            <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-mint/10 blur-2xl" />
            <div className="relative flex items-center gap-3.5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mint/80 to-violet/80 text-base font-bold text-ink">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="display truncate text-lg font-semibold text-cream">{user.name}</p>
                <p className="flex items-center gap-1.5 truncate text-[0.68rem] text-muted">
                  <Mail size={11} />
                  {user.email}
                </p>
                <p className="mt-0.5 text-[0.62rem] text-muted">
                  Level {level.level} · {user.xp.toLocaleString()} XP
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2.5">
                <p className="display text-base font-semibold text-cream">{subjects}</p>
                <p className="text-[0.55rem] uppercase tracking-[0.1em] text-muted">Subjects</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2.5">
                <p className="display text-base font-semibold text-cream">{topics}</p>
                <p className="text-[0.55rem] uppercase tracking-[0.1em] text-muted">Topics</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2.5">
                <p className="display text-base font-semibold text-cream">{badges}</p>
                <p className="text-[0.55rem] uppercase tracking-[0.1em] text-muted">Badges</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-white/6 pt-3.5 text-xs">
              {[
                { icon: Timer, label: "Focus sessions", value: focusCount },
                { icon: BrainCircuit, label: "Quizzes", value: quizzes },
                { icon: Layers, label: "Flashcards", value: cards },
                { icon: NotebookPen, label: "Notes", value: notes },
                { icon: Flame, label: "Current streak", value: `${user.streak} days` },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Icon size={12} className="text-mint" />
                      {row.label}
                    </span>
                    <span className="font-semibold text-cream">{row.value}</span>
                  </div>
                );
              })}
            </div>

            <Link href="/achievements" className="btn btn-secondary btn-sm mt-4 w-full">
              <Trophy size={13} />
              Open trophy shelf
            </Link>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span
                className={
                  aiEnabled()
                    ? "grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint"
                    : "grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-amber/25 bg-amber/10 text-amber"
                }
              >
                <Sparkles size={18} />
              </span>
              <div>
                <p className="display text-base font-semibold text-cream">Nova AI</p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
                  {aiEnabled()
                    ? "Gemini is connected. Summaries, quizzes, flashcards and chat use gemini-2.5-flash."
                    : "Running in demo mode with local generators. Add GEMINI_API_KEY to .env.local and restart to switch on Gemini."}
                </p>
                <span className={aiEnabled() ? "chip chip-mint mt-2" : "chip chip-amber mt-2"}>
                  {aiEnabled() ? "Gemini connected" : "Demo fallback active"}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky/25 bg-sky/10 text-sky">
                <Database size={18} />
              </span>
              <div>
                <p className="display text-base font-semibold text-cream">Your data</p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
                  Everything lives in a local SQLite file (<code className="text-cream">prisma/dev.db</code>).
                  Nothing is sent anywhere except your Gemini prompts, if a key is configured.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip">
                    <KeyRound size={11} />
                    bcrypt hashed
                  </span>
                  <span className="chip">
                    <ShieldCheck size={11} />
                    JWT session
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
            <div className="flex items-start gap-2.5">
              <Nova size={34} mood="happy" />
              <p className="text-[0.65rem] leading-relaxed text-muted">
                <span className="inline-flex items-center gap-1 font-semibold text-cream">
                  <Info size={11} />
                  Demo note
                </span>{" "}
                Email verification, password reset and push reminders are intentionally left out of
                the local build. They are the first things to add before a public launch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
