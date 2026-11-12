import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  Check,
  Layers,
  RotateCcw,
  Target,
  X,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { gradeLabel } from "@/lib/quiz";
import { parseMatchPairs, questionTypeLabel } from "@/lib/quiz-rules";
import { Card, PageHeader, ProgressBar, ReadinessRing } from "@/components/ui";
import { Nova } from "@/components/nova";
import { FormulaText } from "@/components/formula-text";
import { cn, normalizeAnswer } from "@/lib/utils";

export const metadata: Metadata = { title: "Quiz results" };

export default async function QuizResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { id } = await params;
  const { attempt: attemptId } = await searchParams;
  const userId = await requireUserId();

  const quiz = await prisma.quiz.findFirst({
    where: { id, userId },
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      _count: { select: { questions: true } },
    },
  });

  if (!quiz) notFound();

  const attempt = attemptId
    ? await prisma.quizAttempt.findFirst({
        where: { id: attemptId, quizId: quiz.id, userId },
        include: {
          answers: {
            include: { question: true },
            orderBy: { question: { order: "asc" } },
          },
        },
      })
    : await prisma.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId, submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        include: {
          answers: {
            include: { question: true },
            orderBy: { question: { order: "asc" } },
          },
        },
      });

  if (!attempt) redirect(`/quizzes/${quiz.id}`);

  const grade = gradeLabel(attempt.score);
  const correct = attempt.answers.filter((answer) => answer.isCorrect).length;
  const minutes = Math.max(1, Math.round(attempt.timeSpentSec / 60));

  const topicMap = new Map<string, { correct: number; total: number }>();
  for (const answer of attempt.answers) {
    const label =
      answer.question.topicLabel?.trim() || quiz.topic?.name || "General";
    const entry = topicMap.get(label) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    topicMap.set(label, entry);
  }
  const topicStats = [...topicMap.entries()]
    .map(([label, stat]) => ({
      label,
      correct: stat.correct,
      total: stat.total,
      accuracy: Math.round((stat.correct / stat.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const weakTopics = topicStats.filter((topic) => topic.accuracy < 60);

  const subjectQuery = quiz.subject ? `?subject=${quiz.subject.id}` : "";
  const flashcardsHref = `/flashcards${subjectQuery}`;
  const retakeHref = `/quizzes/${quiz.id}`;
  const newQuizHref = quiz.subject
    ? `/quizzes/new?subjectId=${quiz.subject.id}${quiz.topic ? `&topicId=${quiz.topic.id}` : ""}`
    : "/quizzes/new";

  return (
    <div>
      <PageHeader
        eyebrow="Quiz results"
        title={quiz.title}
        description={`${correct} of ${attempt.answers.length} correct · ${minutes} minute${
          minutes === 1 ? "" : "s"
        } spent${quiz.subject ? ` · ${quiz.subject.name}` : ""}`}
        action={
          <>
            <Link href={retakeHref} className="btn btn-secondary">
              <RotateCcw size={14} />
              Retake
            </Link>
            <Link href="/quizzes" className="btn btn-primary">
              <ArrowLeft size={14} />
              All quizzes
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <Card className="relative overflow-hidden p-6 text-center">
            <div className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-mint/10 blur-3xl" />
            <div className="relative">
              <div className="mx-auto w-fit">
                <Nova
                  size={64}
                  mood={attempt.score >= 75 ? "excited" : attempt.score >= 50 ? "happy" : "focused"}
                />
              </div>
              <div className="mt-4 flex justify-center">
                <ReadinessRing value={attempt.score} size={168} label="score" />
              </div>
              <span
                className={cn(
                  "chip mt-4",
                  grade.tone === "mint"
                    ? "chip-mint"
                    : grade.tone === "sky"
                      ? "chip-sky"
                      : grade.tone === "amber"
                        ? "chip-amber"
                        : "chip-pink",
                )}
              >
                {grade.label}
              </span>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {attempt.score >= 85
                  ? "That topic looks solid. Keep one revision touch before the exam."
                  : attempt.score >= 60
                    ? "Close. Review the explanations below, then retake in a couple of days."
                    : "This is useful data. Make flashcards from the misses and try again tomorrow."}
              </p>
              <p className="mt-3 text-[0.62rem] text-muted">
                Submitted{" "}
                {attempt.submittedAt?.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </Card>

          {topicStats.length > 1 || topicStats[0]?.label !== "General" ? (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Target size={15} className="text-violet" />
                <p className="eyebrow">Topic-wise performance</p>
              </div>
              <div className="mt-3 space-y-2.5">
                {topicStats.map((topic) => (
                  <div key={topic.label}>
                    <div className="flex items-baseline justify-between gap-2 text-[0.68rem]">
                      <span className="min-w-0 break-words text-cream">{topic.label}</span>
                      <span
                        className={cn(
                          "shrink-0 font-semibold",
                          topic.accuracy >= 75
                            ? "text-mint"
                            : topic.accuracy >= 50
                              ? "text-amber"
                              : "text-pink",
                        )}
                      >
                        {topic.accuracy}%
                      </span>
                    </div>
                    <ProgressBar value={topic.accuracy} className="mt-1" />
                    <p className="mt-0.5 text-[0.55rem] text-muted">
                      {topic.correct}/{topic.total} correct
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <p className="eyebrow">Next study moves</p>
            <ul className="mt-3 space-y-2 text-[0.68rem] leading-relaxed text-muted">
              {weakTopics.length > 0 ? (
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pink" />
                  Revisit{" "}
                  <span className="text-cream">
                    {weakTopics
                      .slice(0, 3)
                      .map((topic) => topic.label)
                      .join(", ")}
                  </span>{" "}
                  in your notes before the next quiz.
                </li>
              ) : (
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                  No weak topics in this attempt. Keep the material warm with a short review.
                </li>
              )}
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                {weakTopics.length > 0
                  ? "Generate flashcards for the weak topics and review them twice this week."
                  : "Add a harder quiz to stretch beyond recall."}
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                {attempt.score >= 85
                  ? "A spaced revision in 2–3 days is enough before the exam."
                  : "Nova will raise these topics in your roadmap revision blocks."}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={flashcardsHref} className="btn btn-secondary btn-sm">
                <Layers size={13} />
                Review flashcards
              </Link>
              <Link href={newQuizHref} className="btn btn-ghost btn-sm">
                <BrainCircuit size={13} />
                Focused quiz
              </Link>
              {quiz.subject ? (
                <Link
                  href={`/notes?subject=${quiz.subject.id}`}
                  className="btn btn-ghost btn-sm"
                >
                  <BookOpen size={13} />
                  Open notes
                </Link>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          {attempt.answers.map((answer, index) => {
            let options: string[] = [];
            try {
              const parsed = JSON.parse(answer.question.options) as unknown;
              if (Array.isArray(parsed)) options = parsed.map((option) => String(option));
            } catch {
              options = [];
            }

            const isMatch = answer.question.type === "match";
            const matchPairs = isMatch
              ? parseMatchPairs(answer.question.correctAnswer)
              : [];
            let matchResponse: string[] = [];
            if (isMatch) {
              try {
                const parsed = JSON.parse(answer.response) as unknown;
                if (Array.isArray(parsed)) {
                  matchResponse = parsed.map((entry) => String(entry));
                }
              } catch {
                matchResponse = [];
              }
            }

            return (
              <Card
                key={answer.id}
                className={cn(
                  "p-4 sm:p-5",
                  answer.isCorrect ? "border-mint/20" : "border-pink/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                      answer.isCorrect
                        ? "bg-mint/15 text-mint"
                        : "bg-pink/15 text-pink",
                    )}
                  >
                    {answer.isCorrect ? (
                      <Check size={13} strokeWidth={3} />
                    ) : (
                      <X size={13} strokeWidth={3} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted">
                      <span>Question {index + 1}</span>
                      <span className="chip text-[0.5rem] normal-case tracking-normal">
                        {questionTypeLabel(answer.question.type)}
                      </span>
                      {answer.question.topicLabel ? (
                        <span className="chip text-[0.5rem] normal-case tracking-normal">
                          {answer.question.topicLabel}
                        </span>
                      ) : null}
                      {answer.question.format ? (
                        <span className="text-[0.52rem] font-normal normal-case tracking-normal text-muted">
                          {answer.question.format}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-cream">
                      <FormulaText text={answer.question.prompt} />
                    </p>

                    {isMatch ? (
                      <div className="mt-2 space-y-1.5">
                        {matchPairs.map((pair, pairIndex) => {
                          const chosen = matchResponse[pairIndex] ?? "";
                          const pairCorrect =
                            normalizeAnswer(chosen) === normalizeAnswer(pair.right);
                          return (
                            <div
                              key={`${answer.id}-pair-${pairIndex}`}
                              className={cn(
                                "rounded-lg border px-2.5 py-1.5 text-[0.72rem]",
                                pairCorrect
                                  ? "border-mint/25 bg-mint/[0.05]"
                                  : "border-pink/25 bg-pink/[0.05]",
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-cream">
                                  <FormulaText text={pair.left} />
                                </span>
                                <span className="text-muted">→</span>
                                <span className={pairCorrect ? "text-mint" : "text-pink"}>
                                  <FormulaText text={chosen || "— not matched —"} />
                                </span>
                              </div>
                              {!pairCorrect ? (
                                <p className="mt-0.5 text-[0.62rem] text-muted">
                                  Correct match:{" "}
                                  <span className="text-cream">
                                    <FormulaText text={pair.right} />
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : options.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {options.map((option) => {
                          const isCorrectOption = option === answer.question.correctAnswer;
                          const isChosen = option === answer.response;
                          return (
                            <p
                              key={option}
                              className={cn(
                                "rounded-lg border px-2.5 py-1.5 text-[0.72rem]",
                                isCorrectOption
                                  ? "border-mint/30 bg-mint/[0.08] text-mint"
                                  : isChosen
                                    ? "border-pink/30 bg-pink/[0.08] text-pink"
                                    : "border-white/6 text-muted",
                              )}
                            >
                              <FormulaText text={option} />
                              {isCorrectOption ? " · correct" : isChosen ? " · your answer" : ""}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                          <p className="text-[0.58rem] uppercase tracking-[0.14em] text-muted">
                            Your answer
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 text-[0.72rem]",
                              answer.isCorrect ? "text-mint" : "text-pink",
                            )}
                          >
                            <FormulaText text={answer.response || "— blank —"} />
                          </p>
                        </div>
                        <div className="rounded-lg border border-mint/20 bg-mint/[0.05] px-2.5 py-1.5">
                          <p className="text-[0.58rem] uppercase tracking-[0.14em] text-muted">
                            Model answer
                          </p>
                          <p className="mt-0.5 text-[0.72rem] text-cream">
                            <FormulaText text={answer.question.correctAnswer} />
                          </p>
                        </div>
                      </div>
                    )}

                    {answer.question.explanation ? (
                      <p className="mt-2 rounded-lg border-l-2 border-violet/40 bg-white/[0.03] px-3 py-2 text-[0.72rem] leading-relaxed text-muted">
                        <FormulaText text={answer.question.explanation} />
                      </p>
                    ) : null}

                    {answer.question.sourceRef ? (
                      <p className="mt-1.5 text-[0.58rem] text-muted">
                        Source: {answer.question.sourceRef}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
