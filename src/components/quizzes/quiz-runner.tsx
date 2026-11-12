"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, Send, TimerOff } from "lucide-react";
import { submitAttemptAction } from "@/lib/actions/quizzes";
import { FormulaText } from "@/components/formula-text";
import { questionTypeLabel } from "@/lib/quiz-rules";
import { cn } from "@/lib/utils";

type QuizQuestion = {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  points: number;
  matchLeft?: string[];
};

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseMatchValue(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
  } catch {
    // Not JSON — treat as unanswered.
  }
  return [];
}

function isAnswered(question: QuizQuestion, value: string) {
  if (question.type === "match") {
    const left = question.matchLeft ?? [];
    const selected = parseMatchValue(value);
    return left.length > 0 && left.every((_, index) => Boolean(selected[index]?.trim()));
  }
  return Boolean(value.trim());
}

export function QuizRunner({
  quizId,
  questions,
  timeLimitSec,
}: {
  quizId: string;
  questions: QuizQuestion[];
  timeLimitSec: number | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const startedAtRef = useRef<number>(0);
  const startedAtInput = useRef<HTMLInputElement>(null);
  const timeSpentInput = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);
  const elapsedBeforeRef = useRef(0);
  const resumeStartRef = useRef(0);
  const deadlineRef = useRef<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(timeLimitSec);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const resumeKey = `sm:resume:quiz:${quizId}`;

  useEffect(() => {
    startedAtRef.current = Date.now();
    resumeStartRef.current = startedAtRef.current;
    if (startedAtInput.current) startedAtInput.current.value = String(startedAtRef.current);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(resumeKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          answers?: unknown;
          remaining?: unknown;
          elapsedSec?: unknown;
        };
        if (saved.answers && typeof saved.answers === "object") {
          const valid: Record<string, string> = {};
          for (const question of questions) {
            const value = (saved.answers as Record<string, unknown>)[question.id];
            if (typeof value === "string") valid[question.id] = value;
          }
          if (Object.keys(valid).length > 0) setAnswers(valid);
        }
        const savedElapsed = Number(saved.elapsedSec);
        if (Number.isFinite(savedElapsed) && savedElapsed > 0) {
          elapsedBeforeRef.current = savedElapsed;
          resumeStartRef.current = Date.now();
          startedAtRef.current = Date.now() - savedElapsed * 1000;
          if (startedAtInput.current) {
            startedAtInput.current.value = String(startedAtRef.current);
          }
        }
        if (timeLimitSec) {
          const savedRemaining = Number(saved.remaining);
          const nextRemaining =
            Number.isFinite(savedRemaining) && savedRemaining > 0
              ? Math.min(timeLimitSec, Math.round(savedRemaining))
              : timeLimitSec;
          setRemaining(nextRemaining);
          deadlineRef.current = Date.now() + nextRemaining * 1000;
        }
        setResumed(true);
        window.setTimeout(() => setResumed(false), 5000);
      }
    } catch {
      // Corrupt resume data should never block the quiz.
    } finally {
      setHydrated(true);
    }
  }, [questions, resumeKey, timeLimitSec]);

  useEffect(() => {
    if (!timeLimitSec || !hydrated) return;
    if (!deadlineRef.current) deadlineRef.current = Date.now() + timeLimitSec * 1000;
    const deadline = deadlineRef.current;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        prepareSubmit();
        formRef.current?.requestSubmit();
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [timeLimitSec, hydrated, resumeKey]);

  const stateRef = useRef({ answers, remaining });
  stateRef.current = { answers, remaining };

  useEffect(() => {
    if (!hydrated) return;
    function save() {
      try {
        const elapsedSec =
          elapsedBeforeRef.current +
          Math.max(0, Math.round((Date.now() - resumeStartRef.current) / 1000));
        window.localStorage.setItem(
          resumeKey,
          JSON.stringify({
            answers: stateRef.current.answers,
            remaining: stateRef.current.remaining,
            elapsedSec,
            updatedAt: Date.now(),
          }),
        );
      } catch {
        // Ignore unavailable storage.
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") save();
    }
    const interval = window.setInterval(save, 1000);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated, resumeKey]);

  const answered = questions.filter((question) =>
    isAnswered(question, answers[question.id] ?? ""),
  ).length;
  const progress = Math.round((answered / questions.length) * 100);
  const urgent = remaining !== null && remaining <= 60;

  function setAnswer(questionId: string, value: string) {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
  }

  function setMatchAnswer(questionId: string, index: number, value: string, total: number) {
    setAnswers((previous) => {
      const current = parseMatchValue(previous[questionId] ?? "");
      const next = Array.from({ length: total }, (_, position) => current[position] ?? "");
      next[index] = value;
      return { ...previous, [questionId]: JSON.stringify(next) };
    });
  }

  function prepareSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (timeSpentInput.current) {
      timeSpentInput.current.value = String(
        Math.max(
          1,
          elapsedBeforeRef.current +
            Math.round((Date.now() - (resumeStartRef.current || Date.now())) / 1000),
        ),
      );
    }
    try {
      window.localStorage.removeItem(resumeKey);
    } catch {
      // Ignore unavailable storage.
    }
    setSubmitting(true);
  }

  return (
    <form
      ref={formRef}
      action={submitAttemptAction}
      onSubmit={prepareSubmit}
      className="space-y-4"
    >
      <input type="hidden" name="quizId" value={quizId} />
      <input ref={startedAtInput} type="hidden" name="startedAt" defaultValue={0} />
      <input ref={timeSpentInput} type="hidden" name="timeSpentSec" defaultValue={0} />

      <div className="glass-strong sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="progress-track h-2 w-24 sm:w-40">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[0.68rem] font-semibold text-muted">
            {answered} / {questions.length} answered
          </span>
          {resumed ? <span className="chip chip-amber">resumed</span> : null}
        </div>

        <div className="flex items-center gap-2">
          {remaining !== null ? (
            <span
              className={cn(
                "chip tabular-nums",
                urgent ? "chip-pink" : "chip-sky",
              )}
            >
              <Clock size={12} />
              {formatClock(remaining)}
            </span>
          ) : (
            <span className="chip">
              <TimerOff size={12} />
              Untimed
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (answered < questions.length) setConfirmOpen(true);
              else formRef.current?.requestSubmit();
            }}
            className="btn btn-primary btn-sm"
            disabled={submitting}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            {submitting ? "Marking…" : "Submit"}
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div className="rounded-2xl border border-amber/30 bg-amber/[0.08] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-cream">
                {questions.length - answered} question
                {questions.length - answered === 1 ? "" : "s"} still blank
              </p>
              <p className="mt-0.5 text-[0.68rem] text-muted">
                Blank answers are marked wrong. You can go back and answer them first.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Keep answering
                </button>
                <button
                  type="button"
                  onClick={() => formRef.current?.requestSubmit()}
                  className="btn btn-primary btn-sm"
                >
                  Submit anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {questions.map((question, index) => {
          const value = answers[question.id] ?? "";
          const matchSelected = parseMatchValue(value);
          const matchLeft = question.matchLeft ?? [];

          return (
            <div key={question.id} className="glass card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="display grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">{questionTypeLabel(question.type)}</span>
                    {question.points > 1 ? (
                      <span className="chip chip-violet">{question.points} pts</span>
                    ) : null}
                  </div>
                  <p className="mt-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-cream [overflow-wrap:anywhere]">
                    <FormulaText text={question.prompt} />
                  </p>

                  {question.type === "match" ? (
                    <div className="mt-3 space-y-2">
                      {matchLeft.map((left, leftIndex) => (
                        <div
                          key={`${question.id}-${leftIndex}`}
                          className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 sm:grid-cols-[0.9fr_1.1fr] sm:items-center"
                        >
                          <p className="min-w-0 break-words text-sm text-cream [overflow-wrap:anywhere]">
                            <span className="mr-1.5 text-[0.62rem] font-semibold text-muted">
                              {leftIndex + 1}.
                            </span>
                            <FormulaText text={left} />
                          </p>
                          <select
                            name={`q_${question.id}_${leftIndex}`}
                            value={matchSelected[leftIndex] ?? ""}
                            onChange={(event) =>
                              setMatchAnswer(
                                question.id,
                                leftIndex,
                                event.target.value,
                                matchLeft.length,
                              )
                            }
                            className="select h-9 text-xs"
                            aria-label={`Match for ${left}`}
                          >
                            <option value="">Choose a match…</option>
                            {question.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : question.type === "short" ||
                    question.type === "long" ||
                    question.type === "application" ||
                    question.type === "problem" ? (
                    <textarea
                      name={`q_${question.id}`}
                      value={value}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      rows={question.type === "short" ? 3 : 6}
                      placeholder={
                        question.type === "problem"
                          ? "Show your working and final answer…"
                          : question.type === "application"
                            ? "Apply the idea and explain your reasoning…"
                            : "Write your answer…"
                      }
                      className={cn(
                        "textarea mt-3",
                        question.type === "short" ? "min-h-[80px]" : "min-h-[140px]",
                      )}
                    />
                  ) : (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option) => (
                        <label key={option} className="option-row">
                          <input
                            type="radio"
                            name={`q_${question.id}`}
                            value={option}
                            checked={value === option}
                            onChange={() => setAnswer(question.id, option)}
                            className="mt-0.5 accent-[#5BF0C8]"
                          />
                          <span className="min-w-0 flex-1 break-words text-sm text-cream [overflow-wrap:anywhere]">
                            <FormulaText text={option} />
                          </span>
                          {value === option ? (
                            <Check size={14} className="mt-0.5 shrink-0 text-mint" />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pb-4">
        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={submitting}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          {submitting ? "Marking…" : "Submit quiz"}
        </button>
      </div>
    </form>
  );
}
