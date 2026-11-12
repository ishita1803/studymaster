import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, Layers, NotebookPen, ScanLine, Sparkles } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/gemini";
import { NewNoteForm } from "@/components/notes/note-ai";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { colorVar } from "@/lib/utils";

export const metadata: Metadata = { title: "Notes & AI" };
// Uploading a scanned/handwritten document runs OCR inside the action.
export const maxDuration = 60;

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ocr?: string;
    pages?: string;
    skipped?: string;
    subject?: string;
  }>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const subjectFilter = params.subject ?? null;

  const [notes, subjects, cardCount, quizCount] = await Promise.all([
    prisma.note.findMany({
      where: { userId, ...(subjectFilter ? { subjectId: subjectFilter } : {}) },
      include: { subject: { select: { name: true, color: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.subject.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.flashcard.count({ where: { userId, noteId: { not: null } } }),
    prisma.quiz.count({ where: { userId, noteId: { not: null } } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Notes → study material"
        title="Write it once, use it four ways"
        description="Paste a lecture summary or your own notes. Nova can summarise it, turn it into flashcards, and build a practice quiz from the same text."
        action={
          <span className="chip chip-mint">
            <Sparkles size={12} />
            {aiEnabled() ? "Gemini connected" : "Demo mode"}
          </span>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          {params.error}
        </div>
      ) : null}

      {params.ocr ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-lilac/25 bg-lilac/[0.07] px-4 py-3">
          <ScanLine size={16} className="mt-0.5 shrink-0 text-lilac" />
          <p className="text-xs leading-relaxed text-cream">
            Handwriting transcribed with OCR. Open the note and skim the text before you
            generate cards or a quiz.
            {params.skipped
              ? ` Read ${params.pages ? Number(params.pages) - Number(params.skipped) : "most"} of ${params.pages ?? "the"} pages — ${params.skipped} page${
                  params.skipped === "1" ? " was" : "s were"
                } too slow to transcribe.`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Notes" value={notes.length} icon={NotebookPen} tone="mint" />
        <StatCard
          label="Cards from notes"
          value={cardCount}
          icon={Layers}
          tone="violet"
          hint="Auto-generated, still editable"
        />
        <StatCard
          label="Quizzes from notes"
          value={quizCount}
          icon={BrainCircuit}
          tone="pink"
          hint="Every question has an explanation"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-2">
          {notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              description="Paste your first set of notes on the right. Even a rough paragraph works."
            />
          ) : (
            notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="glass card card-hover block p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="display truncate text-base font-semibold text-cream">
                        {note.title}
                      </h3>
                      {note.subject ? (
                        <span className="chip">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: colorVar(note.subject.color) }}
                          />
                          {note.subject.name}
                        </span>
                      ) : null}
                      {note.status === "failed" ? (
                        <span className="chip chip-pink">processing failed</span>
                      ) : note.syllabusStatus === "detected" ? (
                        <span className="chip chip-amber">syllabus to review</span>
                      ) : note.syllabusStatus === "approved" ? (
                        <span className="chip chip-mint">syllabus ready</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                      {note.content.slice(0, 220) || "Empty note"}
                    </p>
                    <p className="mt-2 text-[0.62rem] text-muted">
                      Updated{" "}
                      {note.updatedAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {note.content.trim().split(/\s+/).filter(Boolean).length} words
                    </p>
                  </div>
                  <span className="chip chip-violet shrink-0">open</span>
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <NotebookPen size={16} className="text-mint" />
              <p className="eyebrow">New note</p>
            </div>
            <div className="mt-3">
              <NewNoteForm subjects={subjects} />
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">What Nova does with a note</p>
            <ol className="mt-3 space-y-2.5 text-xs text-muted">
              {[
                "Summarises it into an overview, key points and one exam takeaway.",
                "Writes flashcards — concept → definition and question → answer.",
                "Builds a mixed quiz with explanations for every answer.",
                "Feeds weak-topic detection when you attempt that quiz.",
              ].map((line, index) => (
                <li key={line} className="flex gap-2.5">
                  <span className="display grid h-5 w-5 shrink-0 place-items-center rounded-full border border-mint/25 bg-mint/10 text-[0.6rem] font-semibold text-mint">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
