import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Check,
  Clock,
  Flame,
  Layers,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { getDashboardData } from "@/lib/analytics";
import { levelInfo } from "@/lib/gamification";
import { reschedulePlanAction, togglePlanItemAction, rebuildPlanAction } from "@/lib/actions/plan";
import {
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  ReadinessRing,
  StatCard,
  WeeklyBars,
} from "@/components/ui";
import { Nova } from "@/components/nova";
import { AutoReschedule } from "@/components/plan/auto-reschedule";
import { PlanFormButton } from "@/components/plan/plan-form-button";
import { ResumeCard } from "@/components/dashboard/resume-card";
import {
  cn,
  colorVar,
  examCountdown,
  formatMinutes,
  friendlyDate,
  greeting,
  pct,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function startHref(item: {
  kind: string;
  topicId: string | null;
  subjectId: string | null;
}) {
  if (item.kind === "quiz") {
    return item.topicId ? `/quizzes/new?topic=${item.topicId}` : "/quizzes/new";
  }
  const params = new URLSearchParams();
  if (item.subjectId) params.set("subjectId", item.subjectId);
  if (item.topicId) params.set("topicId", item.topicId);
  const query = params.toString();
  return `/focus${query ? `?${query}` : ""}`;
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const data = await getDashboardData(userId);
  const level = levelInfo(data.user.xp);
  const items = data.todayPlan?.items ?? [];
  const completedItems = items.filter((item) => item.completed).length;
  const goalProgress = pct(data.stats.todayMinutes, data.stats.goalMinutes);

  const nextItem = data.nextPlanItem;
  const resumePlanItem = nextItem
    ? {
        id: nextItem.id,
        title: nextItem.title,
        kind: nextItem.kind,
        startTime: nextItem.startTime,
        minutes: nextItem.minutes,
        dateLabel: friendlyDate(nextItem.planDay.date),
        subjectId: nextItem.subjectId,
        topicId: nextItem.topicId,
        subjectName: nextItem.subject?.name ?? null,
        subjectColor: nextItem.subject?.color ?? "mint",
      }
    : null;

  return (
    <div>
      <AutoReschedule />
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        title={`${greeting()}, ${data.user.name.split(" ")[0]}`}
        description="Here is the honest picture of your week — and the smallest next step that moves it forward."
        mascot
        action={
          <>
            <Link href="/focus" className="btn btn-primary">
              <Timer size={15} />
              Start focus
            </Link>
            <Link href="/roadmap" className="btn btn-secondary">
              <CalendarDays size={15} />
              Roadmap
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Focused this week"
          value={formatMinutes(data.stats.weekMinutes)}
          hint={`${data.stats.studyDaysLast7} active day${data.stats.studyDaysLast7 === 1 ? "" : "s"}`}
          icon={Clock}
          tone="mint"
        />
        <StatCard
          label="Current streak"
          value={`${data.user.streak} day${data.user.streak === 1 ? "" : "s"}`}
          hint={`Best: ${data.user.longestStreak} days`}
          icon={Flame}
          tone="amber"
        />
        <StatCard
          label="Syllabus touched"
          value={`${data.stats.syllabusCompletion}%`}
          hint={`${data.stats.studiedTopics} of ${data.stats.totalTopics} topics`}
          icon={Target}
          tone="violet"
        />
        <StatCard
          label="Cards waiting"
          value={data.stats.dueCards}
          hint={data.stats.dueCards === 0 ? "All caught up" : "A 5-minute review helps"}
          icon={Layers}
          tone="pink"
        />
      </div>

      <ResumeCard
        planItem={resumePlanItem}
        note={
          data.lastNote
            ? {
                id: data.lastNote.id,
                title: data.lastNote.title,
                subjectName: data.lastNote.subject?.name ?? null,
                updatedLabel: friendlyDate(data.lastNote.updatedAt),
              }
            : null
        }
        dueCards={data.dueCards}
        quiz={
          data.latestQuiz
            ? {
                id: data.latestQuiz.id,
                title: data.latestQuiz.title,
                questionCount: data.latestQuiz._count.questions,
              }
            : null
        }
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------------------------------------ today */}
        <Card className="p-5 sm:p-6" glow>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Today&apos;s plan</p>
              <h2 className="display mt-1 text-xl font-semibold text-cream">
                {items.length > 0
                  ? `${completedItems} of ${items.length} blocks done`
                  : "Nothing scheduled yet"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip chip-mint">
                <Zap size={12} />
                {data.stats.todayMinutes} / {data.stats.goalMinutes} min
              </span>
            </div>
          </div>

          <div className="mt-3">
            <ProgressBar value={goalProgress} showLabel />
          </div>

          <div className="mt-5 space-y-2">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                <p className="text-sm font-semibold text-cream">No blocks for today</p>
                <p className="mt-1 text-xs text-muted">
                  Add topics in the roadmap and Nova will build the day for you.
                </p>
                <div className="mt-4">
                  <PlanFormButton
                    action={rebuildPlanAction}
                    idleLabel="Build today's plan"
                    idleIcon={<Sparkles size={13} />}
                    stages={["Recomputing your schedule…", "Spreading revision and quizzes…", "Saving days…"]}
                    className="btn btn-secondary btn-sm"
                  />
                </div>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-stretch gap-2 rounded-2xl border transition",
                    item.completed
                      ? "border-mint/20 bg-mint/[0.06]"
                      : "border-white/8 bg-white/[0.025] hover:border-mint/25 hover:bg-white/[0.05]",
                  )}
                >
                  <form action={togglePlanItemAction} className="min-w-0 flex-1">
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      className="group flex w-full items-start gap-3 px-3.5 py-3 text-left"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                          item.completed
                            ? "border-mint bg-mint text-ink"
                            : "border-white/25 text-transparent group-hover:border-mint/60",
                        )}
                      >
                        <Check size={11} strokeWidth={3.5} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              item.completed ? "text-muted line-through" : "text-cream",
                            )}
                          >
                            {item.title}
                          </span>
                          {item.kind === "revision" ? (
                            <span className="chip chip-violet">revision</span>
                          ) : null}
                          {item.kind === "quiz" ? (
                            <span className="chip chip-amber">
                              <BrainCircuit size={10} />
                              quiz
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted">
                          {item.startTime ? (
                            <>
                              <span className="inline-flex items-center gap-1 font-semibold text-cream/85">
                                <Clock size={9} />
                                {item.startTime}
                              </span>
                              <span>·</span>
                            </>
                          ) : null}
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: colorVar(item.subject?.color ?? "mint") }}
                            />
                            {item.subject?.name}
                          </span>
                          <span>·</span>
                          <span>{item.minutes} min</span>
                          {item.reason ? (
                            <>
                              <span>·</span>
                              <span className="text-muted/80">{item.reason}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </form>
                  {!item.completed ? (
                    <Link
                      href={startHref(item)}
                      className="btn btn-secondary btn-sm my-2.5 mr-2.5 shrink-0 self-start"
                    >
                      {item.kind === "quiz" ? "Practise" : "Start"}
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {items.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-4">
              <Link
                href="/roadmap"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:underline"
              >
                See the full roadmap
                <ArrowRight size={13} />
              </Link>
              <PlanFormButton
                action={reschedulePlanAction}
                idleLabel="Re-plan missed work"
                idleIcon={<RotateCcw size={13} />}
                stages={["Finding missed blocks…", "Fitting them into free slots…", "Saving…"]}
                className="btn btn-ghost btn-sm"
              />
            </div>
          ) : null}
        </Card>

        {/* ------------------------------------------------------------ readiness */}
        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-mint/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-2">
            <div>
              <p className="eyebrow">Exam readiness</p>
              <h2 className="display mt-1 text-xl font-semibold text-cream">
                {data.readiness.score >= 75
                  ? "You're in good shape"
                  : data.readiness.score >= 45
                    ? "Building momentum"
                    : "Plenty of room to grow"}
              </h2>
            </div>
            <Nova size={44} mood={data.readiness.score >= 75 ? "excited" : "focused"} />
          </div>

          <div className="mt-5 flex items-center gap-5">
            <ReadinessRing value={data.readiness.score} size={132} label="ready" />
            <div className="flex-1 space-y-2.5 text-xs">
              {[
                { label: "Syllabus", value: data.readiness.completion },
                { label: "Quiz accuracy", value: data.readiness.accuracy },
                { label: "Revision freshness", value: data.readiness.freshness },
                { label: "Consistency", value: data.readiness.consistency },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-semibold text-cream">{row.value}%</span>
                  </div>
                  <div className="progress-track mt-1 h-1.5">
                    <div className="progress-fill" style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
                <Zap size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-cream">Level {level.level}</p>
                <p className="text-[0.65rem] text-muted">
                  {data.user.xp.toLocaleString()} XP · {level.nextXp - data.user.xp} to next
                </p>
              </div>
            </div>
            <Link href="/achievements" className="btn btn-ghost btn-sm">
              <Trophy size={13} />
              Badges
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Last 7 days</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">Focus rhythm</h2>
            </div>
            <span className="chip chip-mint">
              <TrendingUp size={12} />
              {formatMinutes(data.stats.weekMinutes)}
            </span>
          </div>
          <div className="mt-5">
            <WeeklyBars data={data.weeklyActivity} />
          </div>
          <p className="mt-3 text-[0.68rem] text-muted">
            Only completed focus sessions count. Leaving the timer running while you scroll
            doesn&apos;t earn XP — we checked.
          </p>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Upcoming exams</p>
              <CalendarDays size={15} className="text-muted" />
            </div>
            <div className="mt-3 space-y-2">
              {data.upcomingExams.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted">
                  No exam dates yet. Add one in the roadmap to unlock urgency weighting.
                </p>
              ) : (
                data.upcomingExams.map((subject) => {
                  const countdown = examCountdown(subject.examDate);
                  return (
                    <Link
                      key={subject.id}
                      href="/roadmap"
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-mint/25"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: colorVar(subject.color) }}
                        />
                        <span className="text-xs font-semibold text-cream">{subject.name}</span>
                      </div>
                      <span
                        className={cn(
                          "chip",
                          countdown?.urgent ? "chip-pink" : "chip-mint",
                        )}
                      >
                        {countdown?.label}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Weak-topic radar</p>
              <BrainCircuit size={15} className="text-pink" />
            </div>
            <div className="mt-3 space-y-2">
              {data.weakTopics.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted">
                  No weak topics detected yet. Take a quiz and Nova will find the cracks.
                </p>
              ) : (
                data.weakTopics.slice(0, 3).map((topic) => (
                  <div
                    key={topic.topicId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-pink/15 bg-pink/[0.05] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-cream">
                        {topic.topicName}
                      </p>
                      <p className="text-[0.62rem] text-muted">{topic.subjectName}</p>
                    </div>
                    <span className="chip chip-pink shrink-0">{topic.accuracy}%</span>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/quizzes/new"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:underline"
            >
              Practice a weak topic
              <ArrowRight size={13} />
            </Link>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Recent quiz scores</p>
            <Link href="/quizzes" className="text-xs font-semibold text-mint hover:underline">
              All quizzes
            </Link>
          </div>
          {data.recentAttempts.length === 0 ? (
            <EmptyState
              icon={BrainCircuit}
              title="No quiz attempts yet"
              description="A short quiz is the fastest way to find what needs revision."
              action={{ href: "/quizzes/new", label: "Create a quiz" }}
              className="mt-3 border-0 bg-transparent py-6"
            />
          ) : (
            <div className="mt-3 space-y-2">
              {data.recentAttempts.slice(0, 4).map((attempt) => (
                <Link
                  key={attempt.id}
                  href={`/quizzes/${attempt.quizId}/results?attempt=${attempt.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-mint/25"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-cream">
                      {attempt.quiz.title}
                    </p>
                    <p className="text-[0.62rem] text-muted">
                      {attempt.submittedAt?.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "chip",
                      attempt.score >= 75
                        ? "chip-mint"
                        : attempt.score >= 50
                          ? "chip-amber"
                          : "chip-pink",
                    )}
                  >
                    {Math.round(attempt.score)}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Recent badges</p>
            <Link
              href="/achievements"
              className="text-xs font-semibold text-mint hover:underline"
            >
              Trophy shelf
            </Link>
          </div>
          {data.recentAchievements.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Your trophy shelf is empty"
              description="Finish a focus session to earn First Spark."
              action={{ href: "/focus", label: "Start a session" }}
              className="mt-3 border-0 bg-transparent py-6"
            />
          ) : (
            <div className="mt-3 space-y-2">
              {data.recentAchievements.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-xl border border-amber/25 bg-amber/10 text-amber">
                    <Trophy size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-cream">{entry.achievement.title}</p>
                    <p className="truncate text-[0.62rem] text-muted">
                      {entry.achievement.description}
                    </p>
                  </div>
                  <span className="text-[0.62rem] text-mint">+{entry.achievement.xpReward} XP</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-white/6 bg-white/[0.02] px-5 py-4">
        <div className="flex items-center gap-3">
          <Nova size={36} mood="sleepy" />
          <p className="text-xs text-muted">
            <span className="font-semibold text-cream">Small nudge:</span>{" "}
            {data.dueCards > 0
              ? `${data.dueCards} flashcard${data.dueCards === 1 ? "" : "s"} are due. Five minutes now saves an hour later.`
              : data.upcomingExams.length > 0
                ? `${data.upcomingExams[0].name} is ${examCountdown(data.upcomingExams[0].examDate)?.label.toLowerCase()}. Keep the streak gentle.`
                : "Add an exam date to your subjects and Nova will start reserving revision days."}
          </p>
        </div>
        {data.dueCards > 0 ? (
          <Link href="/flashcards/study" className="btn btn-secondary btn-sm shrink-0">
            Review cards
            <ArrowRight size={13} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
