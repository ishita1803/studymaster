import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, History, ScanLine, Target } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { QuizRunner } from "@/components/quizzes/quiz-runner";
import { Card, PageHeader } from "@/components/ui";
import { parseMatchPairs } from "@/lib/quiz-rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Take quiz" };

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ocr?: string;
    pages?: string;
    skipped?: string;
    notice?: string;
  }>;
}) {
  const { id } = await params;
  const { ocr, pages, skipped, notice } = await searchParams;
  const userId = await requireUserId();

  const quiz = await prisma.quiz.findFirst({
    where: { id, userId },
    include: {
      questions: { orderBy: { order: "asc" } },
      subject: { select: { name: true, color: true } },
      topic: { select: { name: true } },
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 6,
        select: { id: true, score: true, submittedAt: true, timeSpentSec: true },
      },
    },
  });

  if (!quiz) notFound();

  const questions = quiz.questions.map((question) => {
    let options: string[] = [];
    try {
      const parsed = JSON.parse(question.options) as unknown;
      if (Array.isArray(parsed)) options = parsed.map((option) => String(option));
    } catch {
      options = [];
    }
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options,
      points: question.points,
      matchLeft:
        question.type === "match"
          ? parseMatchPairs(question.correctAnswer).map((pair) => pair.left)
          : [],
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow={quiz.subject?.name ?? "Practice quiz"}
        title={quiz.title}
        description={
          quiz.description ||
          `${questions.length} question${questions.length === 1 ? "" : "s"}${
            quiz.topic ? ` on ${quiz.topic.name}` : ""
          }. Answers are explained the moment you submit.`
        }
        action={
          <Link href="/quizzes" className="btn btn-secondary">
            <ArrowLeft size={14} />
            All quizzes
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl">
        {notice ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber/25 bg-amber/[0.07] px-4 py-3">
            <Target size={16} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-xs leading-relaxed text-cream">{notice}</p>
          </div>
        ) : null}
        {ocr ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-lilac/25 bg-lilac/[0.07] px-4 py-3">
            <ScanLine size={16} className="mt-0.5 shrink-0 text-lilac" />
            <p className="text-xs leading-relaxed text-cream">
              These questions were built from OCR-transcribed handwriting. If a question looks
              off, it is probably a misread word — regenerate from a clearer photo.
              {skipped
                ? ` Read ${pages ? Number(pages) - Number(skipped) : "most"} of ${pages ?? "the"} pages — ${skipped} page${
                    skipped === "1" ? " was" : "s were"
                  } too slow to transcribe.`
                : ""}
            </p>
          </div>
        ) : null}
        {questions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="display text-lg font-semibold text-cream">This quiz has no questions</p>
            <p className="mt-1 text-sm text-muted">Create a fresh one and Nova will fill it in.</p>
            <Link href="/quizzes/new" className="btn btn-primary btn-sm mt-4">
              New quiz
            </Link>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="chip chip-violet">
                <Target size={12} />
                {questions.length} questions
              </span>
              {quiz.timeLimitSec ? (
                <span className="chip chip-sky">
                  <Clock size={12} />
                  {Math.round(quiz.timeLimitSec / 60)} minute limit
                </span>
              ) : (
                <span className="chip">No time limit</span>
              )}
              {quiz.attempts.length > 0 ? (
                <span className="chip">
                  <History size={12} />
                  {quiz.attempts.length} previous attempt
                  {quiz.attempts.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <QuizRunner
              quizId={quiz.id}
              questions={questions}
              timeLimitSec={quiz.timeLimitSec}
            />

            {quiz.attempts.length > 0 ? (
              <Card className="mt-6 p-5">
                <p className="eyebrow">Previous attempts</p>
                <div className="mt-3 space-y-2">
                  {quiz.attempts.map((attempt) => (
                    <Link
                      key={attempt.id}
                      href={`/quizzes/${quiz.id}/results?attempt=${attempt.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-mint/25"
                    >
                      <div>
                        <p className="text-xs font-semibold text-cream">
                          {attempt.submittedAt?.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-[0.62rem] text-muted">
                          {Math.max(1, Math.round(attempt.timeSpentSec / 60))} min spent
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
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
