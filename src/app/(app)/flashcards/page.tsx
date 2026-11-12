import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Layers,
  Sparkles,
  Sprout,
  Timer,
  Trash2,
  Trophy,
  ScanLine,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/gemini";
import { CardTools } from "@/components/flashcards/card-tools";
import { deleteAllCardsAction, deleteCardAction } from "@/lib/actions/flashcards";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Card, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { Nova } from "@/components/nova";
import { cn, colorVar, daysBetween } from "@/lib/utils";

export const metadata: Metadata = { title: "Flashcards" };
// OCR of scanned pages can take longer than the default function timeout.
export const maxDuration = 60;

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    subject?: string;
    topic?: string;
    error?: string;
    ocr?: string;
    pages?: string;
    skipped?: string;
  }>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const now = new Date();
  const subjectFilter = params.subject ?? null;
  const scope = subjectFilter ? { subjectId: subjectFilter } : {};

  const [subjects, notes, cards, reviews, totalCards, dueCount, dueBySubject, globalDue, difficultCount] =
    await Promise.all([
      prisma.subject.findMany({
        where: { userId },
        include: { topics: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.note.findMany({
        where: { userId },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.flashcard.findMany({
        where: { userId, ...scope },
        include: {
          subject: { select: { name: true, color: true } },
          topic: { select: { name: true } },
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 80,
      }),
      prisma.flashcardReview.count({
        where: {
          userId,
          ...(subjectFilter ? { card: { subjectId: subjectFilter } } : {}),
        },
      }),
      prisma.flashcard.count({ where: { userId, ...scope } }),
      prisma.flashcard.count({ where: { userId, ...scope, dueAt: { lte: now } } }),
      prisma.flashcard.groupBy({
        by: ["subjectId"],
        where: { userId, dueAt: { lte: now }, subjectId: { not: null } },
        _count: { _all: true },
      }),
      prisma.flashcard.count({ where: { userId, dueAt: { lte: now } } }),
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

  const dueBySubjectMap = new Map(
    dueBySubject.map((row) => [row.subjectId, row._count._all]),
  );
  const studyHref = subjectFilter
    ? `/flashcards/study?subject=${subjectFilter}`
    : "/flashcards/study";
  const difficultHref = subjectFilter
    ? `/flashcards/study?difficult=1&subject=${subjectFilter}`
    : "/flashcards/study?difficult=1";

  const newCards = cards.filter((card) => card.repetitions === 0).length;
  const mature = cards.filter((card) => card.intervalDays >= 21).length;
  const learning = cards.length - newCards - mature;
  const created = Number(params.created ?? 0);
  const activeSubject = subjectFilter
    ? (subjects.find((subject) => subject.id === subjectFilter) ?? null)
    : null;

  return (
    <div>
      <PageHeader
        eyebrow={activeSubject ? `Spaced repetition · ${activeSubject.name}` : "Spaced repetition"}
        title={activeSubject ? `${activeSubject.name} cards` : "Flashcards"}
        description="Rate a card honestly and Nova schedules the next visit. Hard cards come back tomorrow; easy ones drift out to weeks."
        action={
          <>
            <Link
              href={
                subjectFilter
                  ? `/quizzes/new?subjectId=${subjectFilter}`
                  : "/quizzes/new"
              }
              className="btn btn-secondary"
            >
              <BrainCircuit size={14} />
              Quiz me instead
            </Link>
            <Link href={studyHref} className="btn btn-primary">
              <Timer size={14} />
              {dueCount > 0 ? `Study ${dueCount} due` : "Study session"}
            </Link>
          </>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          {params.error === "no-source"
            ? "Add a note, subject, pasted text, or a file before generating cards."
            : params.error === "no-cards"
              ? "Nova could not find clear, studyable facts in that material. Try a fuller paragraph or a clearer scan."
              : params.error === "note-empty"
                ? "That note does not have enough text yet. Add a few sentences (or a clearer scan) and try again."
                : params.error === "confirm"
                  ? "Type DELETE to confirm removing every card in this scope."
                  : params.error}
        </div>
      ) : null}

      {Number(params.deleted ?? 0) > 0 ? (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-amber/25 bg-amber/[0.07] px-4 py-3">
          <Trash2 size={15} className="text-amber" />
          <p className="text-xs text-cream">
            Removed {Number(params.deleted)} card
            {Number(params.deleted) === 1 ? "" : "s"}. Notes, quizzes and plan
            progress were left untouched.
          </p>
        </div>
      ) : null}

      {created > 0 ? (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-mint/25 bg-mint/[0.07] px-4 py-3">
          <Sparkles size={16} className="text-mint" />
          <p className="text-xs text-cream">
            {created} new card{created === 1 ? "" : "s"} added and ready for their first review.
          </p>
          <Link
            href={studyHref}
            className="ml-auto text-[0.68rem] font-semibold text-mint hover:underline"
          >
            Study now
          </Link>
        </div>
      ) : null}

      {params.ocr ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-lilac/25 bg-lilac/[0.07] px-4 py-3">
          <ScanLine size={16} className="mt-0.5 shrink-0 text-lilac" />
          <p className="text-xs leading-relaxed text-cream">
            Handwriting transcribed with OCR. Skim the cards and fix any odd words with
            delete + rewrite if the scan was rough.
            {params.skipped
              ? ` Read ${params.pages ? Number(params.pages) - Number(params.skipped) : "most"} of ${params.pages ?? "the"} pages — ${params.skipped} page${
                  params.skipped === "1" ? " was" : "s were"
                } too slow to transcribe.`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Due today"
          value={dueCount}
          hint={dueCount === 0 ? "Queue clear — rest easy" : "About 25 seconds per card"}
          icon={Timer}
          tone="mint"
        />
        <StatCard
          label="Total cards"
          value={totalCards}
          hint={`${newCards} never reviewed`}
          icon={Layers}
          tone="violet"
        />
        <StatCard
          label="Reviews logged"
          value={reviews}
          hint="Every rating trains the schedule"
          icon={Trophy}
          tone="amber"
        />
        <StatCard
          label="Mature cards"
          value={mature}
          hint="21+ day intervals"
          icon={Sprout}
          tone="sky"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link
              href="/flashcards"
              className={cn("chip", !params.subject && "chip-mint")}
            >
              All cards
              {globalDue > 0 ? (
                <span className="ml-1 rounded-full bg-mint/20 px-1.5 text-[0.55rem] font-semibold text-mint">
                  {globalDue}
                </span>
              ) : null}
            </Link>
            {subjects.map((subject) => {
              const due = dueBySubjectMap.get(subject.id) ?? 0;
              return (
                <Link
                  key={subject.id}
                  href={`/flashcards?subject=${subject.id}`}
                  className={cn("chip", params.subject === subject.id && "chip-mint")}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: colorVar(subject.color) }}
                  />
                  {subject.name}
                  {due > 0 ? (
                    <span className="ml-1 rounded-full bg-mint/20 px-1.5 text-[0.55rem] font-semibold text-mint">
                      {due}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <Link
              href={difficultHref}
              className="chip border-pink/25 text-pink"
            >
              Difficult only
              {difficultCount > 0 ? (
                <span className="ml-1 rounded-full bg-pink/20 px-1.5 text-[0.55rem] font-semibold text-pink">
                  {difficultCount}
                </span>
              ) : null}
            </Link>
          </div>

          {cards.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="mx-auto w-fit">
                <Nova size={56} mood="focused" />
              </div>
              <p className="display mt-3 text-lg font-semibold text-cream">No cards here yet</p>
              <p className="mt-1 text-sm text-muted">
                Generate a set from a note, or write your first card on the right.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => {
                const due = card.dueAt <= now;
                const days = daysBetween(now, card.dueAt);
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "glass card p-4 transition",
                      due && "border-mint/25 bg-mint/[0.03]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-cream">
                          {card.front}
                        </p>
                        <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                          {card.back}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.6rem] text-muted">
                          {card.subject ? (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: colorVar(card.subject.color) }}
                              />
                              {card.subject.name}
                            </span>
                          ) : (
                            <span>General</span>
                          )}
                          {card.topic ? (
                            <>
                              <span>·</span>
                              <span>{card.topic.name}</span>
                            </>
                          ) : card.topicLabel ? (
                            <>
                              <span>·</span>
                              <span>{card.topicLabel}</span>
                            </>
                          ) : null}
                          {card.format ? (
                            <>
                              <span>·</span>
                              <span className="chip text-[0.5rem]">{card.format}</span>
                            </>
                          ) : null}
                          {card.difficulty ? (
                            <>
                              <span>·</span>
                              <span className="capitalize">{card.difficulty}</span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span
                            className={cn(
                              "font-semibold",
                              due ? "text-mint" : "text-muted",
                            )}
                          >
                            {due
                              ? "due now"
                              : days === 1
                                ? "due tomorrow"
                                : `due in ${days} days`}
                          </span>
                          {card.repetitions > 0 ? (
                            <>
                              <span>·</span>
                              <span>{card.intervalDays}d interval</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <ConfirmDeleteDialog
                        title="Delete card"
                        description="Removes this flashcard and its review history. Other cards are untouched."
                        itemId={card.id}
                        deleteAction={deleteCardAction}
                        className="btn btn-ghost btn-icon h-7 w-7 text-muted hover:text-pink"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="eyebrow">Memory health</p>
            <div className="mt-3 space-y-3">
              {[
                { label: "New", value: newCards, tone: "text-sky" },
                { label: "Learning", value: Math.max(0, learning), tone: "text-amber" },
                { label: "Mature", value: mature, tone: "text-mint" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">{row.label}</span>
                    <span className={cn("font-semibold", row.tone)}>{row.value}</span>
                  </div>
                  <ProgressBar
                    value={cards.length ? Math.round((row.value / cards.length) * 100) : 0}
                    className="mt-1.5"
                  />
                </div>
              ))}
            </div>
            <Link href={studyHref} className="btn btn-primary btn-sm mt-4 w-full">
              {dueCount > 0 ? `Review ${dueCount} card${dueCount === 1 ? "" : "s"}` : "Open study mode"}
              <ArrowRight size={13} />
            </Link>
          </Card>

          <Card className="p-5">
            <CardTools
              subjects={subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
                topics: subject.topics,
              }))}
              notes={notes}
              aiEnabled={aiEnabled()}
              defaultSubjectId={subjectFilter}
              defaultTopicId={params.topic ?? null}
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Trash2 size={14} className="text-pink" />
              <p className="eyebrow">Delete cards</p>
            </div>
            <p className="mt-2 text-[0.68rem] leading-relaxed text-muted">
              Remove every card {activeSubject ? `in ${activeSubject.name}` : "you own"}.
              Review history for those cards is removed too. Notes, quizzes and roadmap
              progress are not touched.
            </p>
            <form action={deleteAllCardsAction} className="mt-3 space-y-2">
              {subjectFilter ? (
                <input type="hidden" name="subjectId" value={subjectFilter} />
              ) : null}
              <input
                name="confirm"
                placeholder="Type DELETE to confirm"
                className="input h-9 text-xs"
                autoComplete="off"
                aria-label="Type DELETE to confirm"
              />
              <button
                type="submit"
                className="btn btn-secondary btn-sm w-full border-pink/25 text-pink hover:bg-pink/10"
              >
                <Trash2 size={12} />
                Delete {totalCards} card{totalCards === 1 ? "" : "s"}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
