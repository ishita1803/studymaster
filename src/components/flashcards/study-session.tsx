"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  RotateCcw,
  Shuffle,
  Sparkles,
  Timer,
} from "lucide-react";
import { Nova } from "@/components/nova";
import { FormulaText } from "@/components/formula-text";
import { reviewCardAction } from "@/lib/actions/flashcards";
import { RATING_META, type Rating } from "@/lib/srs";
import { cn } from "@/lib/utils";

type StudyCard = {
  id: string;
  front: string;
  back: string;
  subjectName: string | null;
  subjectColor: string;
  topicName: string | null;
  topicLabel: string;
  format: string;
  sourceRef: string;
  difficulty: string;
  intervalDays: number;
  repetitions: number;
};

const RATINGS: Rating[] = ["hard", "medium", "easy"];
const RESUME_KEY = "sm:resume:flashcards";

// The SRS still has three honest levels; the labels match what a student
// actually feels when a card is revealed.
const STUDY_LABELS: Record<Rating, { label: string; hint: string }> = {
  hard: { label: "Need revision", hint: "back tomorrow" },
  medium: { label: "Getting there", hint: "in a few days" },
  easy: { label: "Known", hint: "longer gap" },
};

type CardResult = { rating: Rating; intervalDays: number };

function shuffled<T>(items: T[]) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function StudySession({
  cards,
  totalDue,
  subjectId,
}: {
  cards: StudyCard[];
  totalDue: number;
  subjectId?: string | null;
}) {
  const router = useRouter();
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState<Rating | null>(null);
  const [results, setResults] = useState<CardResult[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const card = deck[index];
  const finished = index >= deck.length;
  const progress = deck.length > 0 ? Math.round((index / deck.length) * 100) : 0;

  const clearResume = useCallback(() => {
    try {
      window.localStorage.removeItem(RESUME_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RESUME_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          index?: unknown;
          results?: unknown;
          cardIds?: unknown;
        };
        const savedIndex = Number(saved.index);
        const savedIds = Array.isArray(saved.cardIds)
          ? saved.cardIds.map(String)
          : [];
        const prefixLength = Math.min(
          deck.length,
          Number.isFinite(savedIndex) ? Math.max(0, savedIndex) : 0,
        );
        const sameDeck =
          savedIds.length >= prefixLength &&
          savedIds.slice(0, prefixLength).every((id, position) => id === deck[position]?.id);

        if (sameDeck && Number.isFinite(savedIndex) && savedIndex > 0 && savedIndex < deck.length) {
          setIndex(Math.floor(savedIndex));
          setResumed(true);
          window.setTimeout(() => setResumed(false), 5000);
        }
        if (sameDeck && Array.isArray(saved.results)) {
          const valid = saved.results
            .map((entry) => entry as CardResult)
            .filter(
              (entry) =>
                entry &&
                RATINGS.includes(entry.rating) &&
                Number.isFinite(entry.intervalDays),
            );
          if (valid.length > 0) setResults(valid);
        }
      }
    } catch {
      // Corrupt resume data should never block studying.
    } finally {
      setHydrated(true);
    }
  }, [deck]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (finished) {
        window.localStorage.removeItem(RESUME_KEY);
      } else {
        window.localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({
            index,
            results,
            cardIds: deck.map((entry) => entry.id),
            updatedAt: Date.now(),
          }),
        );
      }
    } catch {
      // Ignore unavailable storage.
    }
  }, [hydrated, index, results, finished, deck]);

  const counts = useMemo(() => {
    const tally = { easy: 0, medium: 0, hard: 0 };
    for (const result of results) tally[result.rating] += 1;
    return tally;
  }, [results]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || pending) return;
      setPending(rating);
      const result = await reviewCardAction(card.id, rating);
      if (result?.ok) {
        setResults((previous) => [
          ...previous,
          { rating, intervalDays: result.intervalDays ?? 1 },
        ]);
        setToast(
          `Saved · next review in ${result.intervalDays ?? 1} day${
            (result.intervalDays ?? 1) === 1 ? "" : "s"
          }`,
        );
        setTimeout(() => setToast(null), 2600);
      }
      setFlipped(false);
      setIndex((value) => value + 1);
      setPending(null);
    },
    [card, pending],
  );

  const goPrevious = useCallback(() => {
    setFlipped(false);
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  const goNext = useCallback(() => {
    setFlipped(false);
    setIndex((value) => Math.min(deck.length, value + 1));
  }, [deck.length]);

  const restart = useCallback(
    (shuffle = false) => {
      setDeck(shuffle ? shuffled(cards) : cards);
      setIndex(0);
      setResults([]);
      setFlipped(false);
      setToast(null);
      clearResume();
    },
    [cards, clearResume],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (finished) return;
      if (event.code === "Space") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
      if (flipped && ["1", "2", "3"].includes(event.key)) {
        void rate(RATINGS[Number(event.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, flipped, rate, goPrevious, goNext]);

  const difficultHref = `/flashcards/study?difficult=1${
    subjectId ? `&subject=${subjectId}` : ""
  }`;
  const libraryHref = subjectId ? `/flashcards?subject=${subjectId}` : "/flashcards";

  if (cards.length === 0) {
    return (
      <div className="glass card p-8 text-center">
        <div className="mx-auto w-fit">
          <Nova size={64} mood="sleepy" />
        </div>
        <h2 className="display mt-4 text-xl font-semibold text-cream">
          Nothing due right now
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Spaced repetition means today&apos;s work is genuinely done. Cards will come back when
          they are about to fade — usually tomorrow.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={libraryHref} className="btn btn-primary btn-sm">
            Back to library
          </Link>
          <Link href={difficultHref} className="btn btn-secondary btn-sm">
            Review difficult cards
          </Link>
          <Link
            href={subjectId ? `/quizzes/new?subjectId=${subjectId}` : "/quizzes/new"}
            className="btn btn-ghost btn-sm"
          >
            <Sparkles size={13} />
            Make a quiz instead
          </Link>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="glass card p-8 text-center">
        <div className="mx-auto w-fit">
          <Nova size={72} mood="excited" />
        </div>
        <h2 className="display mt-4 text-2xl font-semibold text-cream">Session complete</h2>
        <p className="mt-2 text-sm text-muted">
          {results.length} card{results.length === 1 ? "" : "s"} reviewed
          {totalDue > cards.length
            ? ` · ${totalDue - cards.length} still waiting in the queue`
            : " · queue cleared"}
        </p>

        <div className="mx-auto mt-5 grid max-w-sm grid-cols-3 gap-2">
          {RATINGS.map((rating) => (
            <div
              key={rating}
              className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2.5"
            >
              <p className="display text-lg font-semibold text-cream">{counts[rating]}</p>
              <p className="text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                {STUDY_LABELS[rating].label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.refresh();
              restart(false);
            }}
            className="btn btn-secondary btn-sm"
          >
            <RotateCcw size={13} />
            Restart deck
          </button>
          <Link href={difficultHref} className="btn btn-secondary btn-sm">
            <Layers size={13} />
            Review difficult only
          </Link>
          <Link href={libraryHref} className="btn btn-primary btn-sm">
            Back to library
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="progress-track h-2 w-32 sm:w-48">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[0.68rem] font-semibold text-muted">
            {index + 1} / {deck.length}
          </span>
          {resumed ? (
            <span className="chip chip-amber">
              <RotateCcw size={11} />
              resumed
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => restart(true)}
            className="chip transition hover:text-cream"
            aria-label="Shuffle the deck"
          >
            <Shuffle size={12} />
            Shuffle
          </button>
          <span className="chip chip-mint">
            <Layers size={12} />
            {totalDue} due today
          </span>
          <span className="chip">
            <Timer size={12} />
            ~{Math.max(1, Math.round(deck.length * 0.4))} min
          </span>
        </div>
      </div>

      <div className="flip-scene mx-auto h-[330px] w-full max-w-xl sm:h-[380px]">
        <button
          type="button"
          onClick={() => setFlipped((value) => !value)}
          className="block h-full w-full text-left"
          aria-label={flipped ? "Show question" : "Show answer"}
        >
          <div className={cn("flip-inner", flipped && "flipped")}>
            {/* front */}
            <div className="flip-face glass-strong justify-between p-6 sm:p-8">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {card.subjectName ? (
                    <span className="chip chip-mint">{card.subjectName}</span>
                  ) : null}
                  {card.topicLabel || card.topicName ? (
                    <span className="chip">{card.topicLabel || card.topicName}</span>
                  ) : null}
                  {card.format ? (
                    <span className="chip text-[0.55rem]">{card.format}</span>
                  ) : null}
                  {card.difficulty ? (
                    <span className="chip text-[0.55rem] capitalize">{card.difficulty}</span>
                  ) : null}
                </div>
                <span className="chip">question</span>
              </div>

              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-3">
                <p className="w-full break-words whitespace-pre-wrap text-lg font-medium leading-relaxed text-cream [overflow-wrap:anywhere] sm:text-xl">
                  <FormulaText text={card.front} />
                </p>
              </div>

              <p className="flex shrink-0 items-center gap-1.5 text-[0.68rem] text-muted">
                <RotateCcw size={12} />
                Tap the card or press Space to reveal
              </p>
            </div>

            {/* back */}
            <div className="flip-face flip-back glass-strong justify-between border-mint/20 p-6 sm:p-8">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <span className="chip chip-mint">answer</span>
                <span className="chip">
                  {card.repetitions === 0 ? "new card" : `${card.repetitions} review${card.repetitions === 1 ? "" : "s"}`}
                </span>
              </div>

              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-3">
                <p className="w-full break-words whitespace-pre-wrap text-lg leading-relaxed text-cream [overflow-wrap:anywhere] sm:text-xl">
                  <FormulaText text={card.back} />
                </p>
              </div>

              <p className="shrink-0 text-[0.68rem] text-muted">
                {card.sourceRef ? `Source: ${card.sourceRef} · ` : ""}
                How did that feel? Rate honestly — the schedule adapts.
              </p>
            </div>
          </div>
        </button>
      </div>

      <div className="mx-auto mt-4 max-w-xl">
        {flipped ? (
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((rating, ratingIndex) => {
              const meta = RATING_META[rating];
              const label = STUDY_LABELS[rating];
              return (
                <button
                  key={rating}
                  type="button"
                  onClick={() => void rate(rating)}
                  disabled={Boolean(pending)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition disabled:opacity-50",
                    rating === "hard"
                      ? "border-pink/30 bg-pink/[0.08] hover:bg-pink/[0.14]"
                      : rating === "medium"
                        ? "border-amber/30 bg-amber/[0.08] hover:bg-amber/[0.14]"
                        : "border-mint/30 bg-mint/[0.08] hover:bg-mint/[0.14]",
                  )}
                >
                  {pending === rating ? (
                    <Loader2 size={16} className="animate-spin text-cream" />
                  ) : (
                    <Check
                      size={16}
                      className={
                        rating === "hard"
                          ? "text-pink"
                          : rating === "medium"
                            ? "text-amber"
                            : "text-mint"
                      }
                    />
                  )}
                  <span className="text-xs font-semibold text-cream">{label.label}</span>
                  <span className="text-[0.58rem] text-muted">{label.hint}</span>
                  <span className="text-[0.55rem] text-muted/70">
                    press {ratingIndex + 1}
                  </span>
                  <span className="sr-only">{meta.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="btn btn-primary w-full"
          >
            Reveal answer
            <ArrowRight size={15} />
          </button>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrevious}
            disabled={index === 0}
            className="btn btn-ghost btn-sm disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <span className="text-[0.62rem] text-muted">
            Skip without rating, or rate to continue
          </span>
          <button
            type="button"
            onClick={goNext}
            className="btn btn-ghost btn-sm"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {toast ? (
        <p className="mx-auto mt-3 w-fit rounded-full border border-mint/25 bg-mint/10 px-4 py-1.5 text-[0.68rem] text-mint">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
