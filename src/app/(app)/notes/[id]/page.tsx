import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ScanLine, Trash2 } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/gemini";
import { NoteAiPanel, SaveNoteForm } from "@/components/notes/note-ai";
import { SyllabusEditor } from "@/components/notes/syllabus-editor";
import { deleteNoteAction } from "@/lib/actions/notes";
import { Card, PageHeader } from "@/components/ui";
import { Nova } from "@/components/nova";

export const metadata: Metadata = { title: "Note" };
// Saving a scanned/handwritten upload runs OCR inside the action.
export const maxDuration = 60;

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  extracting: "Extracting text",
  ocr: "Recognising handwriting",
  identifying: "Identifying topics",
  generating: "Generating material",
  completed: "Completed",
  failed: "Failed",
};

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    ocr?: string;
    pages?: string;
    skipped?: string;
    syllabus?: string;
    count?: string;
    engine?: string;
  }>;
}) {
  const { id } = await params;
  const { error, ocr, pages, skipped, syllabus, count, engine } = await searchParams;
  const userId = await requireUserId();

  const [note, subjects, cards, quizzes, topics] = await Promise.all([
    prisma.note.findFirst({
      where: { id, userId },
      include: { subject: { select: { name: true, syllabusApproved: true } } },
    }),
    prisma.subject.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.flashcard.count({ where: { userId, noteId: id } }),
    prisma.quiz.count({ where: { userId, noteId: id } }),
    prisma.topic.findMany({
      where: { userId, noteId: id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        parentId: true,
        name: true,
        kind: true,
        chapter: true,
        sourceRef: true,
        status: true,
        difficulty: true,
        importance: true,
        estimatedMinutes: true,
        approved: true,
        position: true,
      },
    }),
  ]);

  if (!note) notFound();

  const hasContent = note.content.trim().length >= 40;
  const failed = note.status === "failed" || note.syllabusStatus === "failed";

  return (
    <div>
      <PageHeader
        eyebrow={note.subject?.name ?? "Note"}
        title={note.title}
        description={`Last updated ${note.updatedAt.toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`}
        action={
          <>
            <Link href="/notes" className="btn btn-secondary">
              <ArrowLeft size={14} />
              All notes
            </Link>
            <form action={deleteNoteAction}>
              <input type="hidden" name="id" value={note.id} />
              <button type="submit" className="btn btn-danger">
                <Trash2 size={14} />
                Delete
              </button>
            </form>
          </>
        }
      />

      {error ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          {error}
        </div>
      ) : null}

      {failed ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          <p className="font-semibold">Processing did not finish</p>
          <p className="mt-0.5 leading-relaxed">
            {note.processingError ||
              "Nova could not read this document. Check that the scan is clear, or paste the text manually."}
          </p>
        </div>
      ) : null}

      {syllabus === "detected" ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-mint/25 bg-mint/[0.07] px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-mint" />
          <p className="text-xs leading-relaxed text-cream">
            Detected {count ?? "your"} study topic{count === "1" ? "" : "s"} using{" "}
            {engine === "ai" ? "Gemini" : "the local parser"}. Review the tree below, then
            approve it to add these topics to your roadmap.
          </p>
        </div>
      ) : null}

      {syllabus === "approved" ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-mint/25 bg-mint/[0.07] px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-mint" />
          <p className="text-xs leading-relaxed text-cream">
            Syllabus approved. Your roadmap, flashcards, quizzes and analytics now use these
            topics.
          </p>
        </div>
      ) : null}

      {ocr ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-lilac/25 bg-lilac/[0.07] px-4 py-3">
          <ScanLine size={16} className="mt-0.5 shrink-0 text-lilac" />
          <p className="text-xs leading-relaxed text-cream">
            Handwriting transcribed with OCR and added to this note. Skim it and fix any odd
            words before generating study material.
            {skipped
              ? ` Read ${pages ? Number(pages) - Number(skipped) : "most"} of ${pages ?? "the"} pages — ${skipped} page${
                  skipped === "1" ? " was" : "s were"
                } too slow to transcribe.`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <SaveNoteForm
              noteId={note.id}
              title={note.title}
              content={note.content}
              subjectId={note.subjectId}
              subjects={subjects}
            />
          </Card>

          <Card className="p-5 sm:p-6">
            <SyllabusEditor
              noteId={note.id}
              subjectId={note.subjectId}
              subjectName={note.subject?.name ?? null}
              approved={note.subject?.syllabusApproved ?? true}
              topics={topics}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="eyebrow">Processing</p>
              <span
                className={`chip ${
                  failed
                    ? "chip-pink"
                    : note.status === "completed"
                      ? "chip-mint"
                      : "chip-amber"
                }`}
              >
                {STATUS_LABEL[note.status] ?? note.status}
              </span>
              {note.syllabusStatus !== "none" ? (
                <span className="chip">
                  Syllabus {note.syllabusStatus.replace("_", " ")}
                </span>
              ) : null}
            </div>
            <ol className="space-y-1.5 text-[0.62rem] text-muted">
              {[
                ["uploading", "Upload"],
                ["extracting", "Extract text"],
                ["ocr", "Recognise handwriting"],
                ["identifying", "Identify topics"],
                ["generating", "Generate material"],
                ["completed", "Ready to study"],
              ].map(([key, label]) => {
                const order = [
                  "uploading",
                  "extracting",
                  "ocr",
                  "identifying",
                  "generating",
                  "completed",
                ];
                const current = order.indexOf(note.status);
                const index = order.indexOf(key);
                const done = !failed && current >= 0 && index <= current;
                return (
                  <li key={key} className="flex items-center gap-2">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full border text-[0.5rem] ${
                        done
                          ? "border-mint/40 bg-mint/15 text-mint"
                          : "border-white/10 text-muted"
                      }`}
                    >
                      {done ? "✓" : index + 1}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ol>
            {note.pages ? (
              <p className="mt-2 text-[0.6rem] text-muted">
                {note.pages} page{note.pages === 1 ? "" : "s"} read
                {note.skippedPages
                  ? ` · ${note.skippedPages} skipped (too slow to transcribe)`
                  : ""}
                {note.ocr ? " · OCR used" : ""}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <NoteAiPanel
              noteId={note.id}
              hasContent={hasContent}
              aiEnabled={aiEnabled()}
              existingCards={cards}
              existingQuizzes={quizzes}
            />
          </Card>

          <Card className="relative overflow-hidden p-5">
            <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-mint/10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <Nova size={40} mood="focused" />
              <div>
                <p className="eyebrow">Writing tip</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Write notes as questions and answers. &ldquo;Why does mitosis produce identical
                  cells?&rdquo; is easier to turn into a flashcard than a wall of prose.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[0.62rem] text-muted">
                  <CalendarDays size={11} />
                  {note.createdAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · created"}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
