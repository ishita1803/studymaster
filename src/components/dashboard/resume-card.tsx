"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Clock,
  Layers,
  NotebookPen,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
} from "lucide-react";
import { Card } from "@/components/ui";
import { colorVar } from "@/lib/utils";

export type ResumePlanItem = {
  id: string;
  title: string;
  kind: string;
  startTime: string | null;
  minutes: number;
  dateLabel: string;
  subjectId: string | null;
  topicId: string | null;
  subjectName: string | null;
  subjectColor: string;
};

export type ResumeNote = {
  id: string;
  title: string;
  subjectName: string | null;
  updatedLabel: string;
};

export type ResumeQuiz = {
  id: string;
  title: string;
  questionCount: number;
};

type Progress = {
  key: string;
  href: string;
  label: string;
  detail: string;
  kind: "focus" | "flashcards" | "quiz";
  updatedAt: number;
};

const FOCUS_KEY = "sm:resume:focus";
const CARDS_KEY = "sm:resume:flashcards";
const QUIZ_PREFIX = "sm:resume:quiz:";
/** Ignore stale in-progress entries older than two weeks. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function iconFor(kind: Progress["kind"]) {
  if (kind === "flashcards") return Layers;
  if (kind === "quiz") return BrainCircuit;
  return Timer;
}

function planHref(item: ResumePlanItem) {
  if (item.kind === "quiz") {
    return item.topicId ? `/quizzes/new?topic=${item.topicId}` : "/quizzes/new";
  }
  const params = new URLSearchParams();
  if (item.subjectId) params.set("subjectId", item.subjectId);
  if (item.topicId) params.set("topicId", item.topicId);
  const query = params.toString();
  return `/focus${query ? `?${query}` : ""}`;
}

export function ResumeCard({
  planItem,
  note,
  dueCards,
  quiz,
}: {
  planItem: ResumePlanItem | null;
  note: ResumeNote | null;
  dueCards: number;
  quiz: ResumeQuiz | null;
}) {
  const [progress, setProgress] = useState<Progress[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const found: Progress[] = [];
    const now = Date.now();

    const focus = readJson(FOCUS_KEY);
    if (focus) {
      const remaining = Number(focus.remaining);
      const savedAt = Number(focus.savedAt ?? 0);
      if (Number.isFinite(remaining) && remaining > 0 && now - savedAt < MAX_AGE_MS) {
        const params = new URLSearchParams();
        if (typeof focus.subjectId === "string" && focus.subjectId) {
          params.set("subjectId", focus.subjectId);
        }
        if (typeof focus.topicId === "string" && focus.topicId) {
          params.set("topicId", focus.topicId);
        }
        const query = params.toString();
        found.push({
          key: "focus",
          href: `/focus${query ? `?${query}` : ""}`,
          label: "Focus timer",
          detail: `${Math.ceil(remaining / 60)} min left${focus.phase === "break" ? " · on a break" : ""}`,
          kind: "focus",
          updatedAt: savedAt,
        });
      }
    }

    const cards = readJson(CARDS_KEY);
    if (cards && Array.isArray(cards.cardIds)) {
      const index = Number(cards.index);
      const total = cards.cardIds.length;
      const savedAt = Number(cards.updatedAt ?? 0);
      if (
        Number.isFinite(index) &&
        index > 0 &&
        index < total &&
        now - savedAt < MAX_AGE_MS
      ) {
        found.push({
          key: "flashcards",
          href: "/flashcards/study",
          label: "Flashcard session",
          detail: `Card ${index + 1} of ${total}`,
          kind: "flashcards",
          updatedAt: savedAt,
        });
      }
    }

    try {
      for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith(QUIZ_PREFIX)) continue;
        const quizId = key.slice(QUIZ_PREFIX.length);
        if (!quizId) continue;
        const saved = readJson(key);
        if (!saved) continue;
        const savedAt = Number(saved.updatedAt ?? 0);
        if (now - savedAt >= MAX_AGE_MS) continue;
        const answers =
          saved.answers && typeof saved.answers === "object"
            ? Object.keys(saved.answers as Record<string, unknown>).length
            : 0;
        found.push({
          key,
          href: `/quizzes/${quizId}`,
          label: "Quiz in progress",
          detail: answers > 0 ? `${answers} answer${answers === 1 ? "" : "s"} saved` : "Not submitted yet",
          kind: "quiz",
          updatedAt: savedAt,
        });
      }
    } catch {
      // Storage can be unavailable; the server fallback still works.
    }

    found.sort((a, b) => b.updatedAt - a.updatedAt);
    setProgress(found.slice(0, 3));
    setChecked(true);
  }, []);

  const primary = progress[0] ?? null;
  const PrimaryIcon = primary ? iconFor(primary.kind) : Play;

  return (
    <Card className="relative mt-5 overflow-hidden p-5 sm:p-6" glow>
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet">
            <RotateCcw size={17} />
          </span>
          <div>
            <p className="eyebrow">Pick up where you left off</p>
            <h2 className="display mt-1 text-lg font-semibold text-cream">
              {primary
                ? "You have a session in progress"
                : planItem
                  ? "Your next block is ready"
                  : "Nothing waiting — start something small"}
            </h2>
          </div>
        </div>

        {primary ? (
          <Link href={primary.href} className="btn btn-primary btn-sm">
            <PrimaryIcon size={14} />
            Resume
            <ArrowRight size={13} />
          </Link>
        ) : planItem ? (
          <Link href={planHref(planItem)} className="btn btn-primary btn-sm">
            {planItem.kind === "quiz" ? <BrainCircuit size={14} /> : <Play size={14} />}
            {planItem.kind === "quiz" ? "Practise" : "Start"}
            <ArrowRight size={13} />
          </Link>
        ) : (
          <Link href="/roadmap" className="btn btn-secondary btn-sm">
            <Sparkles size={13} />
            Build a plan
          </Link>
        )}
      </div>

      {/* The most relevant single action: saved progress first, then the plan. */}
      <div className="relative mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
        {primary ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-cream">{primary.label}</span>
            <span className="chip chip-amber">{primary.detail}</span>
            <span className="text-[0.65rem] text-muted">
              Saved in this browser · resume exactly where you stopped
            </span>
          </div>
        ) : planItem ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {planItem.startTime ? (
              <span className="chip chip-mint">
                <Clock size={10} />
                {planItem.startTime}
              </span>
            ) : null}
            <span className="text-sm font-semibold text-cream">{planItem.title}</span>
            <span
              className="inline-flex items-center gap-1 text-[0.65rem] text-muted"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorVar(planItem.subjectColor) }}
              />
              {planItem.subjectName ?? "General"}
            </span>
            <span className="text-[0.65rem] text-muted">
              · {planItem.minutes} min · {planItem.dateLabel}
            </span>
            {planItem.kind === "revision" ? (
              <span className="chip chip-violet">revision</span>
            ) : null}
            {planItem.kind === "quiz" ? (
              <span className="chip chip-amber">practice quiz</span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">
            Add a subject and exam date in the roadmap. Nova will spread the topics across
            your days and leave the last few days for revision.
          </p>
        )}
      </div>

      {/* Secondary shortcuts keep the card useful even when nothing is saved. */}
      <div className="relative mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {checked
          ? progress.slice(1).map((entry) => {
              const Icon = iconFor(entry.kind);
              return (
                <Link
                  key={entry.key}
                  href={entry.href}
                  className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-amber/25 bg-amber/10 text-amber">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.7rem] font-semibold text-cream">
                      {entry.label}
                    </span>
                    <span className="block truncate text-[0.6rem] text-muted">
                      {entry.detail}
                    </span>
                  </span>
                  <ArrowRight size={12} className="shrink-0 text-muted" />
                </Link>
              );
            })
          : null}

        {note ? (
          <Link
            href={`/notes/${note.id}`}
            className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-mint/25 bg-mint/10 text-mint">
              <NotebookPen size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.7rem] font-semibold text-cream">
                {note.title}
              </span>
              <span className="block truncate text-[0.6rem] text-muted">
                Last note · {note.updatedLabel}
              </span>
            </span>
            <ArrowRight size={12} className="shrink-0 text-muted" />
          </Link>
        ) : (
          <Link
            href="/notes"
            className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-mint/25 bg-mint/10 text-mint">
              <NotebookPen size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.7rem] font-semibold text-cream">Add a note</span>
              <span className="block text-[0.6rem] text-muted">Paste or upload material</span>
            </span>
            <ArrowRight size={12} className="shrink-0 text-muted" />
          </Link>
        )}

        <Link
          href="/flashcards/study"
          className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-pink/25 bg-pink/10 text-pink">
            <Layers size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.7rem] font-semibold text-cream">
              {dueCards > 0 ? `${dueCards} card${dueCards === 1 ? "" : "s"} due` : "Flashcards"}
            </span>
            <span className="block truncate text-[0.6rem] text-muted">
              {dueCards > 0 ? "Five minutes now" : "All caught up"}
            </span>
          </span>
          <ArrowRight size={12} className="shrink-0 text-muted" />
        </Link>

        {quiz ? (
          <Link
            href={`/quizzes/${quiz.id}`}
            className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
              <BrainCircuit size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.7rem] font-semibold text-cream">
                {quiz.title}
              </span>
              <span className="block truncate text-[0.6rem] text-muted">
                Latest quiz · {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
              </span>
            </span>
            <ArrowRight size={12} className="shrink-0 text-muted" />
          </Link>
        ) : (
          <Link
            href="/quizzes/new"
            className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-mint/25 hover:bg-white/[0.04]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
              <BrainCircuit size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.7rem] font-semibold text-cream">Make a quiz</span>
              <span className="block text-[0.6rem] text-muted">Paste or upload a chapter</span>
            </span>
            <ArrowRight size={12} className="shrink-0 text-muted" />
          </Link>
        )}
      </div>
    </Card>
  );
}
