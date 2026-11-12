import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Clock,
  Flame,
  Layers,
  NotebookPen,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { getAnalytics, getWeakTopics } from "@/lib/analytics";
import { levelInfo } from "@/lib/gamification";
import {
  Card,
  PageHeader,
  ProgressBar,
  ReadinessRing,
  ScoreLine,
  StatCard,
} from "@/components/ui";
import { Nova } from "@/components/nova";
import { cn, colorVar, examCountdown, formatMinutes, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const MASTERY_ROWS = [
  { key: "mastered", label: "Mastered", tone: "bg-mint", text: "text-mint" },
  { key: "inProgress", label: "In progress", tone: "bg-sky", text: "text-sky" },
  { key: "needsRevision", label: "Needs revision", tone: "bg-amber", text: "text-amber" },
  { key: "notStarted", label: "Not started", tone: "bg-white/25", text: "text-muted" },
] as const;

export default async function AnalyticsPage() {
  const userId = await requireUserId();
  const [data, weakTopics] = await Promise.all([getAnalytics(userId), getWeakTopics(userId)]);

  const level = levelInfo(data.user.xp);
  const weekDelta = data.stats.weekMinutes - data.stats.prevWeekMinutes;
  const weekDeltaPct =
    data.stats.prevWeekMinutes > 0
      ? Math.round((weekDelta / data.stats.prevWeekMinutes) * 100)
      : null;
  const maxMinutes = Math.max(30, ...data.activity.map((day) => day.minutes));
  const totalTopics =
    data.masteryBreakdown.mastered +
    data.masteryBreakdown.inProgress +
    data.masteryBreakdown.needsRevision +
    data.masteryBreakdown.notStarted;
  const scores = data.attempts.map((attempt) => Math.round(attempt.score));
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Progress analytics"
        title="The honest picture"
        description="Numbers that help you decide what to do next — not a scoreboard to feel bad about. Everything here is computed from your real sessions, quizzes and reviews."
        mascot
        action={
          <Link href="/achievements" className="btn btn-secondary">
            <Trophy size={14} />
            Trophy shelf
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Focused this week"
          value={formatMinutes(data.stats.weekMinutes)}
          hint={
            weekDeltaPct === null
              ? "No previous week to compare"
              : `${weekDelta >= 0 ? "+" : ""}${weekDeltaPct}% vs last week`
          }
          icon={weekDelta >= 0 ? TrendingUp : TrendingDown}
          tone={weekDelta >= 0 ? "mint" : "amber"}
        />
        <StatCard
          label="Quiz accuracy"
          value={`${data.stats.accuracy}%`}
          hint={`${data.stats.quizCount} attempts in the last 20`}
          icon={Target}
          tone="violet"
        />
        <StatCard
          label="Cards reviewed"
          value={data.stats.cardsReviewed}
          hint={`${data.stats.totalCards} in the deck · ${data.stats.dueCards} due`}
          icon={Layers}
          tone="sky"
        />
        <StatCard
          label="Active days"
          value={`${data.stats.studyDaysLast7}/7`}
          hint={`Level ${level.level} · ${data.user.xp.toLocaleString()} XP`}
          icon={Flame}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Last 14 days</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                Focus minutes per day
              </h2>
            </div>
            <span className="chip chip-mint">
              <Clock size={12} />
              {formatMinutes(data.stats.totalMinutes)} in 30 days
            </span>
          </div>

          <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2">
            {data.activity.map((day, index) => {
              const height = Math.max(4, Math.round((day.minutes / maxMinutes) * 100));
              const isToday = index === data.activity.length - 1;
              return (
                <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-all",
                        isToday
                          ? "bg-gradient-to-t from-mint/70 to-mint"
                          : "bg-gradient-to-t from-violet/50 via-violet/30 to-mint/50",
                      )}
                      style={{
                        height: `${height}%`,
                        boxShadow: isToday ? "0 0 18px rgba(91,240,200,0.4)" : undefined,
                        minHeight: 4,
                      }}
                      title={`${day.label}: ${day.minutes} min`}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[0.55rem] font-semibold uppercase tracking-wide",
                      isToday ? "text-mint" : "text-muted/70",
                    )}
                  >
                    {day.weekday}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/6 pt-4 text-center">
            <div>
              <p className="display text-lg font-semibold text-cream">
                {formatMinutes(data.stats.weekMinutes)}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.12em] text-muted">This week</p>
            </div>
            <div>
              <p className="display text-lg font-semibold text-cream">
                {formatMinutes(data.stats.prevWeekMinutes)}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.12em] text-muted">Last week</p>
            </div>
            <div>
              <p className="display text-lg font-semibold text-cream">
                {data.stats.studyDaysLast7}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.12em] text-muted">Active days</p>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="eyebrow">Overall readiness</p>
                <h2 className="display mt-1 text-lg font-semibold text-cream">
                  {data.readiness.score >= 75
                    ? "Exam-ready"
                    : data.readiness.score >= 45
                      ? "Getting there"
                      : "Early days"}
                </h2>
              </div>
              <Nova size={42} mood={data.readiness.score >= 75 ? "excited" : "focused"} />
            </div>

            <div className="mt-4 flex justify-center">
              <ReadinessRing value={data.readiness.score} size={150} label="ready" />
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              {[
                { label: "Syllabus coverage", value: data.readiness.completion },
                { label: "Quiz accuracy", value: data.readiness.accuracy },
                { label: "Revision freshness", value: data.readiness.freshness },
                { label: "Consistency", value: data.readiness.consistency },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-semibold text-cream">{row.value}%</span>
                  </div>
                  <ProgressBar value={row.value} className="mt-1" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">By subject</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                Where the effort is landing
              </h2>
            </div>
            <BarChart3 size={16} className="text-muted" />
          </div>

          <div className="mt-4 space-y-3">
            {data.subjectStats.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted">
                Add subjects and topics in the roadmap to unlock subject analytics.
              </p>
            ) : (
              data.subjectStats.map((subject) => {
                const countdown = examCountdown(subject.examDate);
                return (
                  <div
                    key={subject.id}
                    className="rounded-2xl border border-white/8 bg-white/[0.025] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: colorVar(subject.color) }}
                        />
                        <p className="truncate text-sm font-semibold text-cream">{subject.name}</p>
                        {countdown ? (
                          <span className={cn("chip", countdown.urgent ? "chip-pink" : "chip")}>
                            {countdown.label}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-semibold text-mint">
                        {subject.readiness}% ready
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 gap-3 text-[0.62rem] text-muted">
                      <div>
                        <p className="font-semibold text-cream">{subject.topicCount}</p>
                        <p>topics</p>
                      </div>
                      <div>
                        <p className="font-semibold text-cream">{subject.completion}%</p>
                        <p>covered</p>
                      </div>
                      <div>
                        <p className="font-semibold text-cream">
                          {subject.accuracy === null ? "—" : `${subject.accuracy}%`}
                        </p>
                        <p>accuracy</p>
                      </div>
                    </div>

                    <ProgressBar value={subject.completion} className="mt-2.5" />
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Mastery mix</p>
                <h2 className="display mt-1 text-lg font-semibold text-cream">
                  {totalTopics} topics tracked
                </h2>
              </div>
              <Target size={16} className="text-muted" />
            </div>

            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/5">
              {MASTERY_ROWS.map((row) => {
                const value = data.masteryBreakdown[row.key];
                const width = totalTopics ? (value / totalTopics) * 100 : 0;
                if (width === 0) return null;
                return (
                  <div
                    key={row.key}
                    className={row.tone}
                    style={{ width: `${width}%` }}
                    title={`${row.label}: ${value}`}
                  />
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {MASTERY_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-[0.68rem] text-muted">
                    <span className={cn("h-2 w-2 rounded-full", row.tone)} />
                    {row.label}
                  </span>
                  <span className={cn("text-xs font-semibold", row.text)}>
                    {data.masteryBreakdown[row.key]}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/6 pt-4 text-center">
              <div>
                <p className="display text-base font-semibold text-cream">{data.stats.planDone}</p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Blocks done</p>
              </div>
              <div>
                <p className="display text-base font-semibold text-cream">
                  {data.stats.notesCount}
                </p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Notes</p>
              </div>
              <div>
                <p className="display text-base font-semibold text-cream">{data.stats.dueCards}</p>
                <p className="text-[0.58rem] uppercase tracking-[0.1em] text-muted">Due cards</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Quiz trajectory</p>
                <h2 className="display mt-1 text-lg font-semibold text-cream">
                  Last {scores.length} attempt{scores.length === 1 ? "" : "s"}
                </h2>
              </div>
              <div className="text-right">
                <p className="display text-lg font-semibold text-cream">{averageScore}%</p>
                <p className="text-[0.6rem] text-muted">avg · best {bestScore}%</p>
              </div>
            </div>
            <ScoreLine values={scores.slice(-12)} className="mt-3" />
            <div className="mt-3 flex items-center justify-between text-[0.62rem] text-muted">
              <span className="inline-flex items-center gap-1">
                <BrainCircuit size={11} className="text-violet" />
                {data.stats.quizCount} attempts
              </span>
              <Link href="/quizzes/new" className="font-semibold text-mint hover:underline">
                Take another
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Weak-topic detector</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                {weakTopics.length === 0 ? "No cracks found yet" : `${weakTopics.length} topics to revisit`}
              </h2>
            </div>
            <span className="chip chip-pink">
              <BrainCircuit size={12} />
              under 60% accuracy
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {weakTopics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs leading-relaxed text-muted">
                Topics show up here once you have answered at least three quiz questions on them
                and accuracy drops below 60%. That&apos;s a signal to practise, not a failure.
              </p>
            ) : (
              weakTopics.map((topic) => (
                <div
                  key={topic.topicId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink/15 bg-pink/[0.05] px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: colorVar(topic.subjectColor) }}
                      />
                      <p className="truncate text-xs font-semibold text-cream">{topic.topicName}</p>
                    </div>
                    <p className="mt-0.5 text-[0.62rem] text-muted">
                      {topic.subjectName} · {topic.correct}/{topic.total} correct
                    </p>
                    <ProgressBar
                      value={topic.accuracy}
                      className="mt-2 max-w-[220px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="chip chip-pink">{topic.accuracy}%</span>
                    <Link
                      href={`/quizzes/new?topic=${topic.topicId}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Practise
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -left-12 -top-16 h-40 w-40 rounded-full bg-mint/10 blur-3xl" />
          <div className="relative">
            <p className="eyebrow">What Nova noticed</p>
            <div className="mt-3 space-y-3">
              <Insight
                icon={Flame}
                tone="text-amber"
                title={`${data.user.streak}-day streak`}
                body={
                  data.user.streak >= 3
                    ? "Consistency is doing more for you than any single long session. Protect it."
                    : "Two short sessions on back-to-back days beat one heroic Sunday."
                }
              />
              <Insight
                icon={Sparkles}
                tone="text-mint"
                title={
                  data.stats.studyDaysLast7 >= 5
                    ? "Great weekly rhythm"
                    : "Room for one more day"
                }
                body={`You studied on ${data.stats.studyDaysLast7} of the last 7 days. ${
                  data.stats.studyDaysLast7 >= 5
                    ? "That is a sustainable pace."
                    : "Adding a 20-minute day would lift readiness the most."
                }`}
              />
              <Insight
                icon={Layers}
                tone="text-sky"
                title={
                  data.stats.dueCards > 0
                    ? `${data.stats.dueCards} cards are due`
                    : "Flashcard queue is clear"
                }
                body={
                  data.stats.dueCards > 0
                    ? "Reviewing before new material is the cheapest way to raise quiz accuracy."
                    : "Spaced repetition is working in the background. Next reviews are scheduled."
                }
              />
              <Insight
                icon={NotebookPen}
                tone="text-violet"
                title={`${data.stats.notesCount} notes written`}
                body="Notes become flashcards and quizzes, which is why writing one paragraph pays off three times."
              />
            </div>

            <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Level {level.level}</span>
                <span className="font-semibold text-cream">
                  {level.nextXp - data.user.xp} XP to next
                </span>
              </div>
              <ProgressBar value={level.progress} className="mt-2" />
              <Link href="/achievements" className="btn btn-secondary btn-sm mt-3 w-full">
                <Trophy size={13} />
                See all badges
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <p className="mt-5 text-center text-[0.62rem] text-muted">
        Goal completion today: {pct(data.stats.weekMinutes, Math.max(1, Math.round(data.user.dailyStudyHours * 60 * 7)))}% of
        a full week&apos;s target. Readiness weights syllabus 35%, accuracy 35%, freshness 20% and
        consistency 10%.
      </p>
    </div>
  );
}

function Insight({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span className={cn("mt-0.5 shrink-0", tone)}>
        <Icon size={14} />
      </span>
      <div>
        <p className="text-xs font-semibold text-cream">{title}</p>
        <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
