"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { UploadField } from "@/components/files/upload-field";
import {
  createCardAction,
  startFlashcardJobAction,
  type FlashcardJobState,
} from "@/lib/actions/flashcards";
import type { FlashcardJobStatus } from "@/lib/ai/flashcard-jobs";
import { cn } from "@/lib/utils";

type Subject = { id: string; name: string; topics: { id: string; name: string }[] };
type Note = { id: string; title: string };

const initial: FlashcardJobState = {};

export function CardTools({
  subjects,
  notes,
  aiEnabled,
  defaultSubjectId,
  defaultTopicId,
}: {
  subjects: Subject[];
  notes: Note[];
  aiEnabled: boolean;
  defaultSubjectId?: string | null;
  defaultTopicId?: string | null;
}) {
  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [state, action, pending] = useActionState(startFlashcardJobAction, initial);
  const [job, setJob] = useState<FlashcardJobStatus | null>(null);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  // A job that never resolves (server restart) stops polling and surfaces
  // this instead of leaving the student staring at a spinner.
  const [stuck, setStuck] = useState(false);
  const router = useRouter();
  const refreshedRef = useRef<string | null>(null);

  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];
  const jobRunning =
    job?.status === "queued" || job?.status === "running" || pending;

  useEffect(() => {
    const jobId = state.jobId;
    if (!jobId) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let stuck = false;
    // Guard against a stuck job (server restart, dangling queued row): stop
    // polling after ~4 minutes without progress and reset the UI so the
    // student is never locked out of generating cards.
    let ticks = 0;
    const MAX_TICKS = 200;

    const giveUp = () => {
      if (cancelled) return;
      if (interval) clearInterval(interval);
      stuck = true;
      setJob(null);
      setStuck(true);
    };

    const tick = async () => {
      ticks += 1;
      if (ticks > MAX_TICKS) {
        giveUp();
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as FlashcardJobStatus;
        if (cancelled) return;
        setJob(data);

        if (data.status === "completed" || data.status === "failed") {
          if (interval) clearInterval(interval);
          if (data.status === "completed" && refreshedRef.current !== jobId) {
            refreshedRef.current = jobId;
            router.refresh();
          }
        }
      } catch {
        // A transient network error should not stop the next poll.
      }
    };

    void tick();
    interval = setInterval(tick, 1200);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [state.jobId, router]);

  const studyHref = subjectId
    ? `/flashcards/study?subject=${subjectId}`
    : "/flashcards/study";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={cn("btn btn-sm", tab === "ai" ? "btn-primary" : "btn-secondary")}
        >
          <Wand2 size={14} />
          Generate cards
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={cn("btn btn-sm", tab === "manual" ? "btn-primary" : "btn-secondary")}
        >
          <Plus size={14} />
          Write one
        </button>
      </div>

      {tab === "ai" ? (
        <form
          action={action}
          onSubmit={() => {
            setJob(null);
            setStuck(false);
          }}
          className="space-y-3"
        >
          <div>
            <label className="label" htmlFor="card-note">
              From a note
            </label>
            <select id="card-note" name="noteId" className="select">
              <option value="">No note</option>
              {notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="card-subject">
                Or a subject
              </label>
              <select
                id="card-subject"
                name="subjectId"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="select"
              >
                <option value="">No subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="card-count">
                How many
              </label>
              <select id="card-count" name="count" defaultValue={8} className="select">
                {[4, 6, 8, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value} cards
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="card-topic">
              Focus on a topic (optional)
            </label>
            <select
              id="card-topic"
              name="topicId"
              key={subjectId}
              defaultValue={defaultTopicId ?? ""}
              className="select"
              disabled={topics.length === 0}
            >
              <option value="">{topics.length === 0 ? "No topics" : "Whole subject"}</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="card-source">
              Or paste material
            </label>
            <textarea
              id="card-source"
              name="source"
              rows={4}
              placeholder="Paste a paragraph of notes — Nova turns each idea into a card."
              className="textarea min-h-[90px]"
            />
          </div>

          <UploadField
            id="card-file"
            hint="Or upload a chapter, a scanned PDF, or a photo of handwritten notes. Up to 20 MB."
          />

          <p className="text-[0.65rem] leading-relaxed text-muted">
            {aiEnabled
              ? "Gemini writes one-idea cards: concept → definition, process → steps and question → answer."
              : "Demo mode extracts key sentences locally. Add a Gemini key for sharper cards."}
          </p>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={jobRunning}
          >
            {jobRunning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {jobRunning ? "Generating…" : "Generate flashcards"}
          </button>

          {stuck ? (
            <p className="rounded-xl border border-amber/30 bg-amber/[0.08] px-3.5 py-2.5 text-[0.65rem] leading-relaxed text-cream">
              This generation never finished (the server may have restarted).
              Submit again — a fresh run replaces any partial batch.
            </p>
          ) : null}

          {state.error ? (
            <p className="rounded-xl border border-pink/30 bg-pink/10 px-3.5 py-2.5 text-[0.68rem] text-pink">
              {state.error}
            </p>
          ) : null}

          {job ? (
            <div
              className={cn(
                "rounded-2xl border px-3.5 py-3",
                job.status === "completed"
                  ? "border-mint/30 bg-mint/[0.06]"
                  : job.status === "failed"
                    ? "border-pink/30 bg-pink/[0.06]"
                    : "border-violet/25 bg-violet/[0.05]",
              )}
            >
              <div className="flex items-center gap-2">
                {job.status === "completed" ? (
                  <CheckCircle2 size={15} className="shrink-0 text-mint" />
                ) : job.status === "failed" ? (
                  <XCircle size={15} className="shrink-0 text-pink" />
                ) : (
                  <Loader2 size={15} className="shrink-0 animate-spin text-violet" />
                )}
                <p className="text-[0.7rem] font-semibold text-cream">
                  {job.status === "completed"
                    ? job.message || `${job.produced} cards ready`
                    : job.status === "failed"
                      ? "Generation failed"
                      : job.stage}
                </p>
                <span className="ml-auto text-[0.6rem] tabular-nums text-muted">
                  {job.status === "running" || job.status === "queued"
                    ? `${job.progress}%`
                    : ""}
                </span>
              </div>

              {job.status === "running" || job.status === "queued" ? (
                <div className="progress-track mt-2 h-1.5">
                  <div
                    className="progress-fill transition-all duration-500"
                    style={{ width: `${Math.max(4, job.progress)}%` }}
                  />
                </div>
              ) : null}

              {job.status === "failed" ? (
                <div className="mt-2">
                  <p className="text-[0.65rem] leading-relaxed text-pink">{job.error}</p>
                  <button
                    type="button"
                    onClick={() => setJob(null)}
                    className="btn btn-secondary btn-sm mt-2"
                  >
                    <RefreshCw size={12} />
                    Try again
                  </button>
                </div>
              ) : null}

              {job.status === "completed" && job.cards.length > 0 ? (
                <div className="mt-2.5 space-y-2">
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {job.cards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2"
                      >
                        <p className="line-clamp-2 whitespace-pre-wrap text-[0.68rem] font-medium text-cream">
                          {card.front}
                        </p>
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[0.62rem] text-muted">
                          {card.back}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={studyHref} className="btn btn-primary btn-sm">
                      Study now
                    </a>
                    <button
                      type="button"
                      onClick={() => setJob(null)}
                      className="btn btn-ghost btn-sm"
                    >
                      Generate another set
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : (
        <form action={createCardAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="card-front">
              Front (question)
            </label>
            <textarea
              id="card-front"
              name="front"
              required
              rows={2}
              placeholder="What does the mitochondria do?"
              className="textarea min-h-[70px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="card-back">
              Back (answer)
            </label>
            <textarea
              id="card-back"
              name="back"
              required
              rows={2}
              placeholder="Produces ATP — the cell's energy currency."
              className="textarea min-h-[70px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="card-manual-subject">
              Subject
            </label>
            <select
              id="card-manual-subject"
              name="subjectId"
              defaultValue={defaultSubjectId ?? ""}
              className="select"
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary w-full">
            <Plus size={15} />
            Add card
          </button>
        </form>
      )}
    </div>
  );
}
