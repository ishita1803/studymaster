import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  Check,
  Clock,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { capacityShortfallsForUser, getPlanWindow } from "@/lib/plan-service";
import { listUpcomingExams, syncAllSubjectExamDates } from "@/lib/exams";
import { rebuildPlanAction, reschedulePlanAction, togglePlanItemAction } from "@/lib/actions/plan";
import { SyllabusPanel } from "@/components/roadmap/syllabus-panel";
import { ExamPlanner } from "@/components/roadmap/exam-planner";
import { AutoReschedule } from "@/components/plan/auto-reschedule";
import { PlanFormButton } from "@/components/plan/plan-form-button";
import { Card, PageHeader } from "@/components/ui";
import { Nova } from "@/components/nova";
import { cn, colorVar, dateKey, formatMinutes, friendlyDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Roadmap" };

/** Minimum length of the displayed plan window; never an arbitrary cap. */
const WINDOW_MIN_DAYS = 14;
/** Guardrail so a view cannot request thousands of days at once. */
const WINDOW_MAX_DAYS = 180;

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

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    examError?: string;
    examAdded?: string;
    examSaved?: string;
    examDeleted?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const offset = Number.parseInt(params.week ?? "0", 10) || 0;

  // Migrate any legacy single-exam dates into the Exam table before reading.
  await syncAllSubjectExamDates(user.id);

  const today = startOfDay(new Date());
  const windowStart = addDays(today, offset * 7);

  const [subjects, goals, exams, capacity] = await Promise.all([
    prisma.subject.findMany({
      where: { userId: user.id },
      include: {
        topics: {
          include: { children: { select: { id: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dailyGoal.findMany({
      where: {
        userId: user.id,
        date: { gte: windowStart, lt: addDays(windowStart, WINDOW_MAX_DAYS) },
      },
    }),
    listUpcomingExams(user.id, 50),
    capacityShortfallsForUser(user.id),
  ]);
  const capacityWarnings = capacity.filter((entry) => entry.shortfallMinutes > 0);

  // The display window must run at least to the final upcoming exam (the exam
  // day itself included), so a long runway is never truncated at 14 days.
  const lastExam = exams[exams.length - 1];
  const windowDays =
    lastExam != null
      ? Math.min(
          WINDOW_MAX_DAYS,
          Math.max(
            WINDOW_MIN_DAYS,
            differenceInCalendarDays(startOfDay(new Date(lastExam.date)), windowStart) + 1,
          ),
        )
      : WINDOW_MIN_DAYS;
  const windowEnd = addDays(windowStart, windowDays - 1);

  const windowDaysData = await getPlanWindow(user.id, windowStart, windowDays);

  const allItems = windowDaysData.flatMap((day) => day.plan?.items ?? []);
  const plannedMinutes = allItems.reduce((sum, item) => sum + item.minutes, 0);
  const doneMinutes = allItems
    .filter((item) => item.completed)
    .reduce((sum, item) => sum + item.minutes, 0);
  const revisionCount = allItems.filter((item) => item.kind === "revision").length;
  const quizCount = allItems.filter((item) => item.kind === "quiz").length;
  const goalMap = new Map(goals.map((goal) => [dateKey(goal.date), goal]));

  const examByDay = new Map<string, { name: string; color: string }[]>();
  for (const exam of exams) {
    const key = dateKey(exam.date);
    const list = examByDay.get(key) ?? [];
    list.push({ name: exam.name, color: exam.subject.color });
    examByDay.set(key, list);
  }

  const nextExam = exams[0] ?? null;

  const isCurrentWindow = offset === 0;
  const windowTitle = isCurrentWindow
    ? `Your next ${windowDays} days`
    : "Plan window";

  return (
    <div>
      <AutoReschedule />

      {capacityWarnings.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-xs text-amber">
          <p className="font-semibold">
            Too less time — increase your per-day study hours until you are
            satisfied by the roadmap.
          </p>
          <ul className="mt-1.5 space-y-1">
            {capacityWarnings.map((entry) => (
              <li key={entry.examId}>
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: colorVar(entry.subjectColor) }}
                />
                <span className="font-semibold text-cream/90">
                  {entry.subjectName}
                </span>
                · exam in {entry.examInDays} day{entry.examInDays === 1 ? "" : "s"} ·{" "}
                needs {formatMinutes(entry.requiredMinutes)} of material but only{" "}
                {formatMinutes(entry.availableMinutes)} fits at your current daily
                hours (short by {formatMinutes(entry.shortfallMinutes)}).
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {params.examError ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          {params.examError}
        </div>
      ) : null}
      {params.examAdded || params.examSaved || params.examDeleted ? (
        <div className="mb-4 rounded-2xl border border-mint/25 bg-mint/[0.07] px-4 py-3 text-xs text-cream">
          {params.examAdded
            ? "Test added. The roadmap now reserves revision days before it."
            : params.examSaved
              ? "Test date updated and the plan rebuilt around it."
              : "Test removed and the plan rebuilt."}
        </div>
      ) : null}

      <PageHeader
        eyebrow="Adaptive study roadmap"
        title={windowTitle}
        description="Every day has a study block, spaced revision, or a practice quiz — no empty gaps. Times start from your preferred hour, and the final days before each exam stay reserved for revision."
        action={
          <>
            <PlanFormButton
              action={rebuildPlanAction}
              idleLabel="Rebuild plan"
              idleIcon={<RefreshCw size={14} />}
              stages={["Recomputing your schedule…", "Spreading revision and quizzes…", "Saving days…"]}
              className="btn btn-secondary"
            />
            <PlanFormButton
              action={reschedulePlanAction}
              idleLabel="Re-plan missed work"
              idleIcon={<RotateCcw size={14} />}
              stages={["Finding missed blocks…", "Fitting them into free slots…", "Saving…"]}
              className="btn btn-primary"
            />
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">
            Planned in this window
          </p>
          <p className="display mt-1.5 text-2xl font-semibold text-cream">
            {formatMinutes(plannedMinutes)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted">
            {allItems.length} block{allItems.length === 1 ? "" : "s"} across {windowDays} days
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">Completed</p>
          <p className="display mt-1.5 text-2xl font-semibold text-gradient-mint">
            {formatMinutes(doneMinutes)}
          </p>
          <div className="progress-track mt-2 h-1.5">
            <div
              className="progress-fill"
              style={{
                width: `${plannedMinutes ? Math.round((doneMinutes / plannedMinutes) * 100) : 0}%`,
              }}
            />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">
            Revision &amp; quizzes
          </p>
          <p className="display mt-1.5 text-2xl font-semibold text-violet">
            {revisionCount + quizCount}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted">
            {revisionCount} revision · {quizCount} quiz
            {quizCount === 1 ? "" : "zes"} spaced through the plan
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/roadmap?week=${offset - 1}`}
                className="btn btn-secondary btn-icon h-8 w-8"
                aria-label="Previous window"
              >
                <ArrowLeft size={14} />
              </Link>
              <Link
                href={`/roadmap?week=${offset + 1}`}
                className="btn btn-secondary btn-icon h-8 w-8"
                aria-label="Next window"
              >
                <ArrowRight size={14} />
              </Link>
              <p className="ml-1 text-xs font-semibold text-cream">
                {windowStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" – "}
                {windowEnd.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            {!isCurrentWindow ? (
              <Link
                href="/roadmap"
                className="text-[0.68rem] font-semibold text-mint hover:underline"
              >
                Jump back to today
              </Link>
            ) : (
              <span className="text-[0.68rem] text-muted">
                Starts today · {windowDays} days
                {lastExam ? ` · through ${new Date(lastExam.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {windowDaysData.map((day) => {
              const items = day.plan?.items ?? [];
              const dayMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
              const done = items.filter((item) => item.completed).length;
              const isToday = day.key === dateKey(today);
              const goal = goalMap.get(day.key);
              const past = day.date < today;
              const exams = examByDay.get(day.key) ?? [];
              const dayRevisions = items.filter((item) => item.kind === "revision").length;
              const dayQuizzes = items.filter((item) => item.kind === "quiz").length;

              return (
                <div
                  key={day.key}
                  className={cn(
                    "glass card p-4 transition sm:p-5",
                    isToday && "border-mint/30 bg-mint/[0.04]",
                    exams.length > 0 && "border-pink/30 bg-pink/[0.035]",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-center",
                          isToday
                            ? "border-mint/40 bg-mint/15 text-mint"
                            : exams.length > 0
                              ? "border-pink/40 bg-pink/10 text-pink"
                              : "border-white/10 bg-white/[0.03] text-muted",
                        )}
                      >
                        <span className="display text-sm font-semibold leading-none">
                          {day.date.getDate()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-cream">
                          {friendlyDate(day.date)}
                          <span className="ml-2 text-[0.65rem] font-normal text-muted">
                            {day.date.toLocaleDateString(undefined, { weekday: "long" })}
                          </span>
                        </p>
                        <p className="text-[0.65rem] text-muted">
                          {items.length === 0
                            ? "No blocks scheduled"
                            : `${done}/${items.length} done · ${formatMinutes(dayMinutes)}${
                                items[0]?.startTime ? ` · from ${items[0].startTime}` : ""
                              }`}
                          {goal ? ` · goal ${goal.targetMinutes}m` : ""}
                          {dayRevisions > 0 ? ` · ${dayRevisions} revision` : ""}
                          {dayQuizzes > 0 ? ` · ${dayQuizzes} quiz` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {exams.map((exam) => (
                        <span
                          key={exam.name}
                          className="chip chip-pink"
                          title={exam.name}
                        >
                          <CalendarCheck size={11} />
                          {exam.name}
                        </span>
                      ))}
                      {items.length > 0 ? (
                        <span className={cn("chip", done === items.length ? "chip-mint" : "chip")}>
                          {done === items.length
                            ? "Complete"
                            : `${Math.round((done / items.length) * 100)}%`}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-white/8 px-3 py-3 text-center text-[0.68rem] text-muted">
                      {exams.length > 0
                        ? "Exam day. No new work — walk in rested."
                        : past
                          ? "No blocks were scheduled for this day."
                          : "No blocks here yet. Rebuild the plan to fill this day."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-start gap-2">
                          <form action={togglePlanItemAction} className="min-w-0 flex-1">
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className={cn(
                                "group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                                item.completed
                                  ? "border-mint/20 bg-mint/[0.06]"
                                  : "border-white/8 bg-white/[0.025] hover:border-mint/25 hover:bg-white/[0.05]",
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border transition",
                                  item.completed
                                    ? "border-mint bg-mint text-ink"
                                    : "border-white/25 text-transparent group-hover:border-mint/60",
                                )}
                                style={{ width: 18, height: 18 }}
                              >
                                <Check size={10} strokeWidth={3.5} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      "text-xs font-semibold",
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
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.62rem] text-muted">
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
                                      style={{
                                        background: colorVar(item.subject?.color ?? "mint"),
                                      }}
                                    />
                                    {item.subject?.name ?? "General"}
                                  </span>
                                  <span>·</span>
                                  <span>{item.minutes}m</span>
                                  {item.reason ? (
                                    <>
                                      <span>·</span>
                                      <span className="text-muted/75">{item.reason}</span>
                                    </>
                                  ) : null}
                                </span>
                              </span>
                            </button>
                          </form>
                          {!item.completed ? (
                            <Link
                              href={startHref(item)}
                              className="btn btn-secondary btn-sm shrink-0"
                            >
                              {item.kind === "quiz" ? "Practise" : "Start"}
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <ExamPlanner
              subjects={subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
                color: subject.color,
                topics: subject.topics
                  .filter((topic) => topic.approved && topic.children.length === 0)
                  .map((topic) => ({
                    id: topic.id,
                    name: topic.name,
                    chapter: topic.chapter,
                  })),
              }))}
              exams={exams.map((exam) => ({
                id: exam.id,
                name: exam.name,
                date: exam.date,
                importance: exam.importance,
                difficulty: exam.difficulty,
                prepLevel: exam.prepLevel,
                material: exam.material,
                topicIds: exam.examTopics.map((entry) => entry.topicId),
                topicRatings: Object.fromEntries(
                  exam.examTopics.map((entry) => [entry.topicId, entry.difficulty]),
                ),
                subject: {
                  id: exam.subject.id,
                  name: exam.subject.name,
                  color: exam.subject.color,
                },
              }))}
            />
          </Card>

          <Card className="p-4 sm:p-5">
            <SyllabusPanel
              subjects={subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
                color: subject.color,
                examDate: subject.examDate,
                importance: subject.importance,
                difficulty: subject.difficulty,
                prepLevel: subject.prepLevel,
                syllabusApproved: subject.syllabusApproved,
                topics: subject.topics.map((topic) => ({
                  id: topic.id,
                  name: topic.name,
                  status: topic.status,
                  difficulty: topic.difficulty,
                  importance: topic.importance,
                  estimatedMinutes: topic.estimatedMinutes,
                  masteryScore: topic.masteryScore,
                })),
              }))}
            />
          </Card>

          <Card className="relative overflow-hidden p-5">
            <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-violet/10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <Nova size={42} mood="focused" />
              <div>
                <p className="eyebrow">How re-planning works</p>
                <ul className="mt-2 space-y-2 text-[0.7rem] leading-relaxed text-muted">
                  <li className="flex gap-2">
                    <Sparkles size={12} className="mt-0.5 shrink-0 text-mint" />
                    Completed blocks are kept. Missed work is re-planned from today.
                  </li>
                  <li className="flex gap-2">
                    <CalendarCheck size={12} className="mt-0.5 shrink-0 text-violet" />
                    Sessions are spaced across the runway instead of stacked on day one.
                  </li>
                  <li className="flex gap-2">
                    <RotateCcw size={12} className="mt-0.5 shrink-0 text-pink" />
                    The final 2–5 days before each exam stay reserved for revision and
                    practice quizzes.
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Today at a glance</p>
            <div className="mt-3 space-y-2 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Daily target</span>
                <span className="font-semibold text-cream">
                  {Math.round(user.dailyStudyHours * 60)} min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Study starts</span>
                <span className="font-semibold text-cream">{user.studyStartTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Topics in syllabus</span>
                <span className="font-semibold text-cream">
                  {subjects.reduce((sum, subject) => sum + subject.topics.length, 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Next exam</span>
                <span className="font-semibold text-cream">
                  {nextExam?.date
                    ? `${nextExam.name} · ${new Date(nextExam.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : "None set"}
                </span>
              </div>
            </div>
            <Link href="/settings" className="btn btn-secondary btn-sm mt-4 w-full">
              Adjust daily hours
              <ArrowRight size={13} />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
