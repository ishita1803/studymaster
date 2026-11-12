import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getOverallAccuracy } from "@/lib/analytics";
import { deleteQuizAction } from "@/lib/actions/quizzes";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Card, EmptyState, PageHeader, ScoreLine, StatCard } from "@/components/ui";
import { cn, colorVar } from "@/lib/utils";

export const metadata: Metadata = { title: "Quizzes" };

export default async function QuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const subjectFilter = params.subject ?? null;
  const scope = subjectFilter ? { subjectId: subjectFilter } : {};

  const [subjects, quizzes, attempts, accuracy, countsBySubject] = await Promise.all([
    prisma.subject.findMany({
      where: { userId },
      select: { id: true, name: true, color: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quiz.findMany({
      where: { userId, ...scope },
      include: {
        subject: { select: { name: true, color: true } },
        _count: { select: { questions: true } },
        attempts: {
          where: { submittedAt: { not: null } },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { id: true, score: true, submittedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quizAttempt.findMany({
      where: {
        userId,
        submittedAt: { not: null },
        ...(subjectFilter ? { quiz: { subjectId: subjectFilter } } : {}),
      },
      orderBy: { submittedAt: "asc" },
      select: { score: true, submittedAt: true },
    }),
    getOverallAccuracy(userId),
    prisma.quiz.groupBy({
      by: ["subjectId"],
      where: { userId, subjectId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countBySubject = new Map(
    countsBySubject.map((row) => [row.subjectId, row._count._all]),
  );
  const newHref = subjectFilter
    ? `/quizzes/new?subjectId=${subjectFilter}`
    : "/quizzes/new";
  const manualHref = subjectFilter
    ? `/quizzes/new?subjectId=${subjectFilter}&tab=manual`
    : "/quizzes/new?tab=manual";
  const activeSubject = subjectFilter
    ? (subjects.find((subject) => subject.id === subjectFilter) ?? null)
    : null;

  const trend = attempts.map((attempt) => Math.round(attempt.score));
  const best = attempts.length > 0 ? Math.max(...trend) : 0;
  const average =
    trend.length > 0 ? Math.round(trend.reduce((sum, value) => sum + value, 0) / trend.length) : 0;

  return (
    <div>
      <PageHeader
        eyebrow={activeSubject ? `Quizzes · ${activeSubject.name}` : "Quizzes & mock tests"}
        title={activeSubject ? `${activeSubject.name} practice` : "Test yourself, gently"}
        description="Every attempt feeds your weak-topic radar and readiness score. No penalty for a low first score — that's data, not a verdict."
        action={
          <>
            <Link href={manualHref} className="btn btn-secondary">
              <Plus size={14} />
              Build manually
            </Link>
            <Link href={newHref} className="btn btn-primary">
              <Sparkles size={14} />
              Generate quiz
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/quizzes" className={cn("chip", !subjectFilter && "chip-mint")}>
          All quizzes
        </Link>
        {subjects.map((subject) => {
          const count = countBySubject.get(subject.id) ?? 0;
          return (
            <Link
              key={subject.id}
              href={`/quizzes?subject=${subject.id}`}
              className={cn("chip", subjectFilter === subject.id && "chip-mint")}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorVar(subject.color) }}
              />
              {subject.name}
              {count > 0 ? (
                <span className="ml-1 rounded-full bg-mint/20 px-1.5 text-[0.55rem] font-semibold text-mint">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Quizzes"
          value={quizzes.length}
          hint={`${quizzes.reduce((sum, quiz) => sum + quiz._count.questions, 0)} questions total`}
          icon={BrainCircuit}
          tone="violet"
        />
        <StatCard
          label="Attempts"
          value={attempts.length}
          hint={attempts.length === 0 ? "No attempts yet" : "Practice is the point"}
          icon={Target}
          tone="mint"
        />
        <StatCard
          label="Average score"
          value={`${average}%`}
          hint={accuracy.total > 0 ? `${accuracy.correct}/${accuracy.total} answers correct` : "—"}
          icon={TrendingUp}
          tone="sky"
        />
        <StatCard
          label="Best score"
          value={`${best}%`}
          hint={best >= 90 ? "Excellent work" : best > 0 ? "Room to climb" : "Take a quiz to set a bar"}
          icon={CheckCircle2}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          {quizzes.length === 0 ? (
            <EmptyState
              icon={BrainCircuit}
              title={activeSubject ? `No ${activeSubject.name} quizzes yet` : "No quizzes yet"}
              description="Generate one from your notes, or build a manual mock test with your own questions."
              action={{ href: newHref, label: "Create your first quiz" }}
            />
          ) : (
            quizzes.map((quiz) => {
              const lastAttempt = quiz.attempts[0];
              return (
                <Card key={quiz.id} hover className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/quizzes/${quiz.id}`}
                          className="display text-base font-semibold text-cream hover:text-mint"
                        >
                          {quiz.title}
                        </Link>
                        <span
                          className={cn(
                            "chip",
                            quiz.source === "manual" ? "" : "chip-violet",
                          )}
                        >
                          {quiz.source === "manual" ? "manual" : quiz.source === "notes" ? "from notes" : "AI"}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.68rem] text-muted">
                        {quiz.subject ? <span>{quiz.subject.name}</span> : <span>General</span>}
                        <span>·</span>
                        <span>{quiz._count.questions} questions</span>
                        {quiz.timeLimitSec ? (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} />
                              {Math.round(quiz.timeLimitSec / 60)} min
                            </span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>
                          {quiz.createdAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {lastAttempt ? (
                        <Link
                          href={`/quizzes/${quiz.id}/results?attempt=${lastAttempt.id}`}
                          className="text-right"
                        >
                          <p className="display text-lg font-semibold text-cream">
                            {Math.round(lastAttempt.score)}%
                          </p>
                          <p className="text-[0.6rem] text-muted">last score</p>
                        </Link>
                      ) : null}
                      <Link
                        href={`/quizzes/${quiz.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {lastAttempt ? "Retake" : "Start"}
                        <ArrowRight size={13} />
                      </Link>
                      <ConfirmDeleteDialog
                        title={`Delete ${quiz.title}`}
                        description="Removes this quiz, its questions and all attempts. Your streak, XP and topic mastery stay untouched."
                        itemId={quiz.id}
                        deleteAction={deleteQuizAction}
                        className="btn btn-ghost btn-sm text-muted hover:text-pink"
                      />
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Score trend</p>
                <p className="display mt-1 text-lg font-semibold text-cream">Last 20 attempts</p>
              </div>
              <span className="chip chip-mint">{trend.length} logged</span>
            </div>
            <ScoreLine values={trend.slice(-20)} className="mt-4" />
            <p className="mt-2 text-[0.68rem] leading-relaxed text-muted">
              A dip after a hard mock is normal. Nova looks at the last few attempts, not just one.
            </p>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Question formats</p>
            <div className="mt-3 space-y-2.5 text-xs text-muted">
              <p>
                <span className="font-semibold text-cream">Multiple choice</span> — four options,
                one correct. Fast recall.
              </p>
              <p>
                <span className="font-semibold text-cream">True / false</span> — quick concept
                checks and common misconceptions.
              </p>
              <p>
                <span className="font-semibold text-cream">Short answer</span> — graded by keyword
                overlap, so write the key term clearly.
              </p>
            </div>
            <Link href={newHref} className="btn btn-secondary btn-sm mt-4 w-full">
              <Sparkles size={13} />
              Generate from a note
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
