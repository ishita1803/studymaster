import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  CalendarDays,
  Check,
  Flame,
  Hourglass,
  Layers,
  NotebookPen,
  Pencil,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getAchievementOverview, levelInfo, XP_RULES } from "@/lib/gamification";
import { Card, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { Nova } from "@/components/nova";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Achievements" };

const ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  waves: Waves,
  hourglass: Hourglass,
  pencil: Pencil,
  star: Star,
  flame: Flame,
  layers: Layers,
  check: Check,
  notebook: NotebookPen,
  calendar: CalendarDays,
  sparkles: Sparkles,
  bot: Bot,
};

const XP_LABELS: Record<string, string> = {
  focus: "Focus session",
  plan_item: "Plan block done",
  quiz: "Quiz finished",
  perfect_quiz: "Perfect quiz",
  flashcard: "Flashcard review",
  daily_goal: "Daily goal",
  achievement: "Achievement bonus",
};

export default async function AchievementsPage() {
  const userId = await requireUserId();
  const [overview, user, xpEvents] = await Promise.all([
    getAchievementOverview(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.xpEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const level = levelInfo(user.xp);
  const earned = overview.filter((achievement) => achievement.earnedAt);
  const locked = overview.filter((achievement) => !achievement.earnedAt);
  const totalXpFromBadges = earned.reduce((sum, achievement) => sum + achievement.xpReward, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Gamification"
        title="Your trophy shelf"
        description="Badges are milestones, not grades. Every one of them rewards a habit that makes studying easier to keep up."
        action={
          <Link href="/analytics" className="btn btn-secondary">
            <Trophy size={14} />
            Progress analytics
          </Link>
        }
      />

      <Card className="relative overflow-hidden p-5 sm:p-6" glow>
        <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-amber/10 blur-3xl" />
        <div className="absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-violet/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="grid h-20 w-20 place-items-center rounded-3xl border border-amber/30 bg-gradient-to-br from-amber/20 via-amber/5 to-transparent">
                <span className="display text-2xl font-bold text-amber">L{level.level}</span>
              </div>
              <Nova size={36} mood="excited" className="absolute -bottom-3 -right-3" />
            </div>
            <div>
              <p className="eyebrow">Level {level.level}</p>
              <p className="display mt-1 text-2xl font-semibold text-cream">
                {user.xp.toLocaleString()} XP
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {level.nextXp - user.xp} XP to level {level.level + 1}
              </p>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <div className="flex justify-between text-[0.62rem] text-muted">
              <span>Level {level.level}</span>
              <span>Level {level.level + 1}</span>
            </div>
            <ProgressBar value={level.progress} className="mt-1.5" showLabel />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="display text-base font-semibold text-cream">{earned.length}</p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Badges</p>
              </div>
              <div>
                <p className="display text-base font-semibold text-cream">
                  {user.streak}
                </p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Streak</p>
              </div>
              <div>
                <p className="display text-base font-semibold text-cream">
                  {totalXpFromBadges}
                </p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Bonus XP</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Longest streak"
          value={`${user.longestStreak} days`}
          hint={user.streak === user.longestStreak ? "Currently at your best" : `Current: ${user.streak} days`}
          icon={Flame}
          tone="amber"
        />
        <StatCard
          label="Badges earned"
          value={`${earned.length}/${overview.length}`}
          hint={locked.length === 0 ? "Full shelf" : `${locked.length} still to unlock`}
          icon={Trophy}
          tone="mint"
        />
        <StatCard
          label="XP this level"
          value={`${Math.max(0, user.xp - level.startXp)}`}
          hint={`${level.nextXp - level.startXp} XP band`}
          icon={Zap}
          tone="violet"
        />
        <StatCard
          label="Lifetime XP"
          value={user.xp.toLocaleString()}
          hint="Focus, quizzes, cards and goals"
          icon={Sparkles}
          tone="sky"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="eyebrow">Earned</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                {earned.length} badge{earned.length === 1 ? "" : "s"} on the shelf
              </h2>
            </div>
          </div>

          {earned.length === 0 ? (
            <Card className="p-8 text-center">
              <Nova size={56} mood="sleepy" />
              <p className="display mt-3 text-lg font-semibold text-cream">Nothing earned yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Complete a focus session to unlock First Spark — it is the easiest one to start
                with.
              </p>
              <Link href="/focus" className="btn btn-primary btn-sm mt-4">
                Start a focus session
              </Link>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {earned.map((achievement) => {
                const Icon = ICONS[achievement.icon] ?? Trophy;
                return (
                  <Card
                    key={achievement.code}
                    className="relative overflow-hidden border-amber/20 p-4"
                    hover
                  >
                    <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-amber/10 blur-2xl" />
                    <div className="relative flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber/30 bg-gradient-to-br from-amber/20 to-transparent text-amber">
                        <Icon size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-cream">{achievement.title}</p>
                          <span className="chip chip-amber">+{achievement.xpReward} XP</span>
                        </div>
                        <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
                          {achievement.description}
                        </p>
                        <p className="mt-1.5 text-[0.58rem] uppercase tracking-[0.1em] text-mint">
                          earned{" "}
                          {achievement.earnedAt?.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mb-3 mt-6 flex items-center justify-between">
            <div>
              <p className="eyebrow">Locked</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                {locked.length} to unlock
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {locked.map((achievement) => {
              const Icon = ICONS[achievement.icon] ?? Trophy;
              const progress = achievement.progress;
              const value = Math.min(progress.target, progress.value);
              const percent = Math.round(
                (value / Math.max(1, progress.target)) * 100,
              );
              return (
                <Card key={achievement.code} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted">
                      <Icon size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-sm font-semibold text-cream">{achievement.title}</p>
                        <span className="text-[0.6rem] font-semibold text-muted">
                          +{achievement.xpReward} XP
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
                        {achievement.description}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={percent} className="flex-1" />
                        <span className="w-14 shrink-0 text-right text-[0.6rem] tabular-nums text-muted">
                          {value}/{progress.target}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="eyebrow">How XP works</p>
            <div className="mt-3 space-y-2 text-xs">
              {[
                { label: "Focus session", value: "~1 XP / 2.5 min" },
                { label: "Planned block done", value: `+${XP_RULES.planItem} XP` },
                { label: "Quiz finished", value: `+${XP_RULES.quiz} XP` },
                { label: "Perfect quiz bonus", value: `+${XP_RULES.perfectQuiz} XP` },
                { label: "Flashcard review", value: `+${XP_RULES.flashcard} XP` },
                { label: "Daily goal met", value: `+${XP_RULES.dailyGoal} XP` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-muted">{row.label}</span>
                  <span className="font-semibold text-cream">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-white/6 pt-3 text-[0.62rem] leading-relaxed text-muted">
              XP only counts completed focus sessions. Abandoning a timer earns nothing — Nova is
              strict about that one.
            </p>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Recent XP</p>
            {xpEvents.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-[0.68rem] text-muted">
                Your XP history will appear here after your first session.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {xpEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[0.68rem] transition hover:bg-white/[0.03]"
                  >
                    <span className="text-muted">
                      {XP_LABELS[event.action] ?? event.action}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-mint">+{event.amount}</span>
                      <span className="text-[0.58rem] text-muted/70">
                        {event.createdAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="relative overflow-hidden p-5">
            <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-mint/10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <Nova size={40} mood="happy" />
              <div>
                <p className="eyebrow">A gentle note</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Badges are a nudge, not a scoreboard. If a streak breaks, the habit is still
                  there — start again today and Nova will keep the history.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
