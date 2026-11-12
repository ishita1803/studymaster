"use client";

import { useActionState } from "react";
import {
  BrainCircuit,
  Layers,
  NotebookPen,
  Sparkles,
  Wand2,
} from "lucide-react";
import { MarkdownLite } from "@/components/markdown-lite";
import { UploadField } from "@/components/files/upload-field";
import { PendingSubmit } from "@/components/ui/pending-progress";
import {
  cardsFromNoteAction,
  createNoteAction,
  quizFromNoteAction,
  summarizeNoteAction,
  updateNoteAction,
  type SummaryState,
} from "@/lib/actions/notes";
import { cn } from "@/lib/utils";

const initial: SummaryState = {};

export function NoteAiPanel({
  noteId,
  hasContent,
  aiEnabled,
  existingCards,
  existingQuizzes,
}: {
  noteId: string;
  hasContent: boolean;
  aiEnabled: boolean;
  existingCards: number;
  existingQuizzes: number;
}) {
  const [state, action] = useActionState(summarizeNoteAction, initial);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="noteId" value={noteId} />
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="display text-base font-semibold text-cream">Revision summary</p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
              {aiEnabled
                ? "Gemini condenses this note into an overview, key points and an exam takeaway."
                : "Demo mode builds a local summary from your own sentences."}
            </p>
          </div>
        </div>

        <PendingSubmit
          idleLabel="Summarise note"
          stages={["Reading your note…", "Condensing key points…", "Writing the summary…"]}
          icon={<Wand2 size={15} />}
          disabled={!hasContent}
          className="btn btn-primary w-full"
        />
        {!hasContent ? (
          <p className="text-center text-[0.62rem] text-muted">
            Add some content to the note first.
          </p>
        ) : null}
      </form>

      {state.error ? (
        <p className="rounded-xl border border-pink/30 bg-pink/10 px-3.5 py-2.5 text-[0.68rem] text-pink">
          {state.error}
        </p>
      ) : null}

      {state.text ? (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <MarkdownLite text={state.text} />
        </div>
      ) : null}

      <div className="divider" />

      <div className="space-y-2">
        <p className="eyebrow">Turn it into practice</p>

        <form action={cardsFromNoteAction} className="flex items-start gap-2">
          <input type="hidden" name="noteId" value={noteId} />
          <select
            name="count"
            defaultValue={8}
            className="select h-9 flex-1 py-0 text-xs"
            aria-label="Card count"
          >
            {[4, 6, 8, 10, 15].map((value) => (
              <option key={value} value={value}>
                {value} cards
              </option>
            ))}
          </select>
          <PendingSubmit
            idleLabel="Cards"
            icon={<Layers size={13} />}
            stages={["Reading the note…", "Writing cards…", "Saving…"]}
            disabled={!hasContent}
            className="btn btn-secondary btn-sm"
          />
        </form>

        <form action={quizFromNoteAction} className="flex items-start gap-2">
          <input type="hidden" name="noteId" value={noteId} />
          <select
            name="count"
            defaultValue={5}
            className="select h-9 flex-1 py-0 text-xs"
            aria-label="Question count"
          >
            {[3, 5, 8, 10].map((value) => (
              <option key={value} value={value}>
                {value} questions
              </option>
            ))}
          </select>
          <PendingSubmit
            idleLabel="Quiz"
            icon={<BrainCircuit size={13} />}
            stages={["Reading the note…", "Writing questions…", "Saving…"]}
            disabled={!hasContent}
            className="btn btn-secondary btn-sm"
          />
        </form>

        <p className="text-[0.62rem] text-muted">
          {existingCards} card{existingCards === 1 ? "" : "s"} and {existingQuizzes} quiz
          {existingQuizzes === 1 ? "" : "zes"} already made from this note.
        </p>
      </div>
    </div>
  );
}

export function NewNoteForm({
  subjects,
  defaultSubjectId,
}: {
  subjects: { id: string; name: string }[];
  defaultSubjectId?: string | null;
}) {
  return (
    <form action={createNoteAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="note-title">
          Title
        </label>
        <input
          id="note-title"
          name="title"
          required
          placeholder="Cell division — mitosis vs meiosis"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="note-subject">
          Subject
        </label>
        <select
          id="note-subject"
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
      <div>
        <label className="label" htmlFor="note-content">
          Notes
        </label>
        <textarea
          id="note-content"
          name="content"
          rows={5}
          placeholder="Write or paste your notes. Nova can summarise them, make flashcards and build a quiz."
          className="textarea"
        />
      </div>
      <UploadField
        id="note-file"
        hint="Upload slides, a chapter, or a photo of handwritten notes. PDF, DOCX, TXT, MD, CSV, PNG, JPG or WEBP · up to 20 MB."
      />
      <PendingSubmit
        idleLabel="Create note"
        icon={<NotebookPen size={15} />}
        stages={[
          "Uploading file…",
          "Extracting text (OCR for scans)…",
          "Saving the note…",
        ]}
        className="btn btn-primary w-full"
      />
    </form>
  );
}

export function SaveNoteForm({
  noteId,
  title,
  content,
  subjectId,
  subjects,
}: {
  noteId: string;
  title: string;
  content: string;
  subjectId: string | null;
  subjects: { id: string; name: string }[];
}) {
  return (
    <form
      action={updateNoteAction}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={noteId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <label className="label" htmlFor="edit-title">
            Title
          </label>
          <input
            id="edit-title"
            name="title"
            defaultValue={title}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="edit-subject">
            Subject
          </label>
          <select
            id="edit-subject"
            name="subjectId"
            defaultValue={subjectId ?? ""}
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
      </div>
      <div>
        <label className="label" htmlFor="edit-content">
          Content
        </label>
        <textarea
          id="edit-content"
          name="content"
          defaultValue={content}
          rows={18}
          className={cn("textarea min-h-[340px] font-mono text-[0.8rem] leading-relaxed")}
        />
      </div>
      <UploadField
        id="edit-note-file"
        hint="Add a document or a photo of handwritten notes (PDF, DOCX, TXT, MD, CSV, PNG, JPG, WEBP). Its text is appended when you save."
      />
      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.62rem] text-muted">
          Saved notes keep their old summaries — regenerate after big edits.
        </p>
        <PendingSubmit
          idleLabel="Save note"
          icon={<NotebookPen size={13} />}
          stages={["Uploading file…", "Extracting appended text…", "Saving the note…"]}
          className="btn btn-primary btn-sm"
        />
      </div>
    </form>
  );
}
