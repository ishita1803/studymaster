import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Layers, Sparkles } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StudySession } from "@/components/flashcards/study-session";
import { PageHeader } from "@/components/ui";
import { cn, colorVar } from "@/lib/utils";

export const metadata: Metadata = { title: "Study flashcards" };

export default async function StudyFlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; difficult?: string }>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const now = new Date();
  const difficultOnly = params.difficult === "1";

  const subjects = await prisma.subject.findMany({
    where: { userId },
    select: { id: true, name: true, color: true },
    orderBy: { createdAt: "asc" },
  });

  const activeSubject = params.subject
    ? (subjects.find((subject) => subject.id === params.subject) ?? null)
    : null;
  const scope = activeSubject ? { subjectId: activeSubject.id } : {};

  // Difficult mode deliberately ignores the due date: a card rated "hard"
  // is due tomorrow, but a student may want to revisit it right away.
  const cardScope = difficultOnly
    ? {
        OR: [
          { lastRating: "hard" },
          { difficulty: "hard" },
          { lapses: { gt: 0 } },
        ],
      }
    : { dueAt: { lte: now } };

  const [cards, dueCount, difficultCount] = await Promise.all([
    prisma.flashcard.findMany({
      where: { userId, ...scope, ...cardScope },
      include: {
        subject: { select: { name: true, color: true } },
        topic: { select: { name: true } },
      },
      orderBy: difficultOnly
        ? [{ lapses: "desc" }, { dueAt: "asc" }]
        : [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 25,
    }),
    prisma.flashcard.count({
      where: { userId, ...scope, dueAt: { lte: now } },
    }),
    prisma.flashcard.count({
      where: {
        userId,
        ...scope,
        OR: [
          { lastRating: "hard" },
          { difficulty: "hard" },
          { lapses: { gt: 0 } },
        ],
      },
    }),
  ]);

  const libraryHref = activeSubject
    ? `/flashcards?subject=${activeSubject.id}`
    : "/flashcards";
  const difficultHref = activeSubject
    ? `/flashcards/study?difficult=1&subject=${activeSubject.id}`
    : "/flashcards/study?difficult=1";
  const normalHref = activeSubject
    ? `/flashcards/study?subject=${activeSubject.id}`
    : "/flashcards/study";

  return (
    <div>
      <PageHeader
        eyebrow={
          difficultOnly
            ? "Difficult cards"
            : activeSubject
              ? `Study mode · ${activeSubject.name}`
              : "Study mode"
        }
        title={
          difficultOnly
            ? "Revisit the tricky ones"
            : activeSubject
              ? `${activeSubject.name} cards`
              : "One card at a time"
        }
        description="Tap to flip, then mark it Known or Need revision. Space flips the card; arrow keys move between cards and keys 1, 2 and 3 rate the three levels."
        action={
          <>
            <Link href={libraryHref} className="btn btn-secondary">
              <ArrowLeft size={14} />
              Library
            </Link>
            <Link
              href={
                activeSubject
                  ? `/quizzes/new?subjectId=${activeSubject.id}`
                  : "/quizzes/new"
              }
              className="btn btn-ghost"
            >
              <Sparkles size={14} />
              Quiz instead
            </Link>
          </>
        }
      />

      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href="/flashcards/study"
            className={cn("chip", !activeSubject && !difficultOnly && "chip-mint")}
          >
            All subjects
          </Link>
          {subjects.map((subject) => (
            <Link
              key={subject.id}
              href={`/flashcards/study?subject=${subject.id}`}
              className={cn(
                "chip",
                activeSubject?.id === subject.id && !difficultOnly && "chip-mint",
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorVar(subject.color) }}
              />
              {subject.name}
            </Link>
          ))}
          <Link
            href={difficultHref}
            className={cn("chip", difficultOnly && "chip-pink")}
          >
            Difficult only
            {difficultCount > 0 ? (
              <span className="ml-1 rounded-full bg-pink/20 px-1.5 text-[0.55rem] font-semibold text-pink">
                {difficultCount}
              </span>
            ) : null}
          </Link>
          {difficultOnly ? (
            <Link href={normalHref} className="chip">
              Back to due queue
            </Link>
          ) : null}
        </div>

        {difficultOnly ? (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-pink/25 bg-pink/[0.06] px-3.5 py-2 text-[0.68rem] text-pink">
            <Layers size={13} />
            Showing cards you rated hard, that have lapsed, or that Nova marked difficult.
          </p>
        ) : dueCount > 25 ? (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-sky/25 bg-sky/[0.06] px-3.5 py-2 text-[0.68rem] text-sky">
            <Layers size={13} />
            {dueCount} cards are due. This session covers 25 — the rest stay in the queue.
          </p>
        ) : null}

        <StudySession
          cards={cards.map((card) => ({
            id: card.id,
            front: card.front,
            back: card.back,
            subjectName: card.subject?.name ?? null,
            subjectColor: card.subject?.color ?? "mint",
            topicName: card.topic?.name ?? null,
            topicLabel: card.topicLabel,
            format: card.format,
            sourceRef: card.sourceRef,
            difficulty: card.difficulty,
            intervalDays: card.intervalDays,
            repetitions: card.repetitions,
          }))}
          totalDue={difficultOnly ? difficultCount : dueCount}
          subjectId={activeSubject?.id ?? null}
        />
      </div>
    </div>
  );
}
