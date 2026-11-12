import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  NotebookPen,
  Plus,
  Route,
  ScanLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SyllabusUploadForm } from "@/components/subjects/syllabus-upload-form";
import { SubjectNoteUploadForm } from "@/components/subjects/subject-note-upload-form";
import { SyllabusEditor } from "@/components/notes/syllabus-editor";
import { updateSubjectAction, deleteSubjectAction } from "@/lib/actions/subjects";
import { deleteSubjectNoteAction } from "@/lib/actions/subject-upload";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Card, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { Nova } from "@/components/nova";
import { cn, colorVar, examCountdown, startOfDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Subject" };
// Uploading a scanned/handwritten document runs OCR inside the action.
export const maxDuration = 60;

const NOTE_STATUS: Record<string, { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "chip" },
  extracting: { label: "Extracting", tone: "chip chip-sky" },
  recognizing: { label: "Reading handwriting", tone: "chip chip-violet" },
  identifying: { label: "Finding topics", tone: "chip chip-amber" },
  generating: { label: "Generating", tone: "chip chip-amber" },
  completed: { label: "Processed", tone: "chip chip-mint" },
  failed: { label: "Failed", tone: "chip chip-pink" },
};

const SYLLABUS_ROLE = "syllabus";

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    syllabus?: string;
    count?: string;
    engine?: string;
    created?: string;
    deleted?: string;
    uploaded?: string;
    pages?: string;
    skipped?: string;
    note?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const userId = await requireUserId();
  const now = new Date();

  const [subject, cardCount, dueCount, difficultCount, syllabusDocCount] =
    await Promise.all([
      prisma.subject.findFirst({
        where: { id, userId },
        include: {
          topics: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          notes: {
            orderBy: { updatedAt: "desc" },
            include: { topic: { select: { name: true } } },
          },
          exams: {
            where: { date: { gte: startOfDay() } },
            orderBy: { date: "asc" },
            include: { examTopics: { select: { topicId: true } } },
          },
          quizzes: {
            orderBy: { createdAt: "desc" },
            take: 6,
            include: {
              _count: { select: { questions: true } },
              attempts: {
                where: { submittedAt: { not: null } },
                orderBy: { submittedAt: "desc" },
                take: 1,
                select: { score: true },
              },
            },
          },
        },
      }),
      // Safe to run beside the ownership check: both are scoped to THIS user,
      // so a foreign id would yield 0 counts and the notFound() below fires.
      prisma.flashcard.count({ where: { userId, subjectId: id } }),
      prisma.flashcard.count({
        where: { userId, subjectId: id, dueAt: { lte: now } },
      }),
      prisma.flashcard.count({
        where: {
          userId,
          subjectId: id,
          OR: [{ lastRating: "hard" }, { difficulty: "hard" }, { lapses: { gt: 0 } }],
        },
      }),
      prisma.note.count({ where: { subjectId: id, role: SYLLABUS_ROLE } }),
    ]);

  if (!subject) notFound();

  const notes = subject.notes;
  const leaves = subject.topics.filter(
    (topic) =>
      topic.approved &&
      !subject.topics.some((candidate) => candidate.parentId === topic.id),
  );
  const approved = subject.topics.filter((topic) => topic.approved).length;
  const unapproved = subject.topics.length - approved;
  const nextExam = subject.exams[0] ?? null;
  const countdown = examCountdown(nextExam ? nextExam.date : null);
  const syllabusApproved = subject.syllabusApproved && unapproved === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Study container"
        title={subject.name}
        description={
          subject.description ||
          "Two independent sections: an approved Syllabus decides the roadmap, and lecture Notes are the material for cards and quizzes."
        }
        action={
          <>
            <Link href="/subjects" className="btn btn-secondary">
              <ArrowLeft size={14} />
              All subjects
            </Link>
            <Link href="/roadmap" className="btn btn-primary">
              <Route size={14} />
              Roadmap &amp; tests
            </Link>
          </>
        }
      />

      {query.error ? (
        <div className="mb-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-xs text-pink">
          {query.error}
        </div>
      ) : null}

      {query.syllabus === "detected" ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-violet/25 bg-violet/[0.07] px-4 py-3">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-violet" />
          <p className="text-xs leading-relaxed text-cream">
            {query.uploaded === "1" ? "Uploaded and extracted" : "Detected"}{" "}
            {Number(query.count ?? 0)} study topic
            {Number(query.count ?? 0) === 1 ? "" : "s"} from the official syllabus.
            Review the tree, edit anything that looks wrong, then approve it to
            make the topics available for tests and the roadmap.
            {query.engine ? ` (${query.engine})` : ""}
          </p>
        </div>
      ) : null}

      {query.syllabus === "current" ? (
        <div className="mb-4 rounded-2xl border border-mint/25 bg-mint/[0.07] px-4 py-3 text-xs text-cream">
          This syllabus is already up to date for the current documents —{" "}
          {Number(query.count ?? 0)} topic{Number(query.count ?? 0) === 1 ? "" : "s"}
          {" "}acted on without reprocessing. Change a document and re-detect to rebuild.
        </div>
      ) : null}

      {query.note ? (
        <div className="mb-4 rounded-2xl border border-sky/25 bg-sky/[0.07] px-4 py-3 text-xs text-cream">
          {query.note === "added"
            ? "Lecture note added. It never changes the syllabus — use it for cards and quizzes."
            : "Note deleted. Its cards and the syllabus stay untouched."}
        </div>
      ) : null}

      {query.skipped && Number(query.skipped) > 0 ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber/25 bg-amber/[0.07] px-4 py-3">
          <ScanLine size={16} className="mt-0.5 shrink-0 text-amber" />
          <p className="text-xs leading-relaxed text-cream">
            Read {query.pages ? `${query.pages} pages` : "the document"}, but skipped{" "}
            {query.skipped} page{Number(query.skipped) === 1 ? "" : "s"} that could not be
            transcribed. Those pages are not represented in the syllabus — upload a
            clearer scan if they matter.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Syllabus topics"
          value={approved}
          hint={
            unapproved > 0
              ? `${unapproved} waiting for approval`
              : `${leaves.length} schedulable leaf topics`
          }
          icon={BookOpen}
          tone="violet"
        />
        <StatCard
          label="Official syllabus docs"
          value={syllabusDocCount}
          hint={
            notes.length
              ? `${notes.length} lecture note${notes.length === 1 ? "" : "s"} alongside`
              : "No lecture notes yet"
          }
          icon={BookMarked}
          tone="sky"
        />
        <StatCard
          label="Flashcards"
          value={cardCount}
          hint={dueCount > 0 ? `${dueCount} due now` : "Nothing due right now"}
          icon={Layers}
          tone="mint"
        />
        <StatCard
          label="Quizzes"
          value={subject.quizzes.length}
          hint="Weak answers feed topic mastery"
          icon={BrainCircuit}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ---------------- Section 1: Syllabus ---------------- */}
        <div className="space-y-5">
          <Card className="border-violet/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookMarked size={16} className="text-violet" />
                <div>
                  <p className="eyebrow">Section 1 · Syllabus</p>
                  <p className="mt-0.5 text-[0.65rem] font-semibold text-cream">
                    The one source of truth for tests &amp; roadmap
                  </p>
                </div>
              </div>
              <span className="chip">
                <FileText size={11} />
                {syllabusDocCount} official doc{syllabusDocCount === 1 ? "" : "s"}
              </span>
            </div>

            {syllabusApproved ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-mint/25 bg-mint/[0.06] px-3 py-2 text-[0.65rem] leading-relaxed text-cream">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-mint" />
                Approved. Every topic here feeds exam topic selection and the
                roadmap. Re-upload a new official syllabus to replace or extend it.
              </p>
            ) : null}

            <div className="mt-4">
              <SyllabusUploadForm subjectId={subject.id} />
            </div>
          </Card>

          <Card className="p-5">
            <SyllabusEditor
              noteId={null}
              subjectId={subject.id}
              subjectName={subject.name}
              approved={syllabusApproved}
              topics={subject.topics.map((topic) => ({
                id: topic.id,
                parentId: topic.parentId,
                name: topic.name,
                kind: topic.kind,
                chapter: topic.chapter,
                sourceRef: topic.sourceRef,
                status: topic.status,
                difficulty: topic.difficulty,
                importance: topic.importance,
                estimatedMinutes: topic.estimatedMinutes,
                approved: topic.approved,
                position: topic.position,
              }))}
            />
          </Card>

          {subject.topics.length > 0 ? (
            <Card className="p-5">
              <p className="eyebrow">Syllabus progress</p>
              <div className="mt-2 flex items-baseline justify-between text-xs">
                <span className="text-muted">Approved</span>
                <span className="font-semibold text-mint">
                  {approved}/{subject.topics.length}
                </span>
              </div>
              <ProgressBar
                value={
                  subject.topics.length
                    ? Math.round((approved / subject.topics.length) * 100)
                    : 0
                }
                className="mt-1.5"
              />
              <p className="mt-2 text-[0.6rem] leading-relaxed text-muted">
                {leaves.length} leaf topic{leaves.length === 1 ? "" : "s"} can be
                scheduled. Chapters are containers and are never scheduled on their own.
              </p>
            </Card>
          ) : null}

          {unapproved > 0 ? (
            <Card className="border-violet/20 p-5">
              <div className="flex items-start gap-2.5">
                <Nova size={40} mood="focused" />
                <div>
                  <p className="text-xs font-semibold text-cream">
                    {unapproved} detected topic{unapproved === 1 ? "" : "s"} need review
                  </p>
                  <p className="mt-1 text-[0.62rem] leading-relaxed text-muted">
                    Detected topics stay out of tests and the roadmap until you approve
                    them. Review the tree above, then approve and plan.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        {/* ---------------- Section 2: Notes ---------------- */}
        <div className="space-y-5">
          <Card className="border-sky/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <NotebookPen size={16} className="text-sky" />
                <div>
                  <p className="eyebrow">Section 2 · Notes</p>
                  <p className="mt-0.5 text-[0.65rem] font-semibold text-cream">
                    Lecture notes — managed independently
                  </p>
                </div>
              </div>
              <span className="chip">
                <FileText size={11} />
                {notes.length} note{notes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-4">
              <SubjectNoteUploadForm subjectId={subject.id} />
            </div>

            {notes.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-white/6 pt-4">
                {notes.map((note) => {
                  const status = NOTE_STATUS[note.status] ?? NOTE_STATUS.ready;
                  return (
                    <div
                      key={note.id}
                      className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 transition hover:border-sky/25"
                    >
                      <FileText size={14} className="mt-0.5 shrink-0 text-sky" />
                      <Link href={`/notes/${note.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-cream">
                          {note.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.58rem] text-muted">
                          <span className={cn(status.tone, "text-[0.5rem]")}>
                            {status.label}
                          </span>
                          <span>·</span>
                          <span>{note.content.trim().split(/\s+/).filter(Boolean).length} words</span>
                          {note.pages ? (
                            <>
                              <span>·</span>
                              <span>{note.pages} pages</span>
                            </>
                          ) : null}
                          {note.ocr ? (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <ScanLine size={9} /> OCR
                              </span>
                            </>
                          ) : null}
                          {note.skippedPages ? (
                            <>
                              <span>·</span>
                              <span className="text-amber">
                                {note.skippedPages} page
                                {note.skippedPages === 1 ? "" : "s"} skipped
                              </span>
                            </>
                          ) : null}
                          {note.topic?.name ? (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 text-violet">
                                <BookOpen size={9} /> {note.topic.name}
                              </span>
                            </>
                          ) : null}
                        </p>
                        {note.status === "failed" && note.processingError ? (
                          <p className="mt-1 line-clamp-2 text-[0.58rem] text-pink">
                            {note.processingError}
                          </p>
                        ) : null}
                      </Link>
                      {/* Deleting a note never touches the syllabus. */}
                      <form action={deleteSubjectNoteAction} className="shrink-0">
                        <input type="hidden" name="id" value={note.id} />
                        <button
                          type="submit"
                          aria-label={`Delete ${note.title}`}
                          className="btn btn-ghost btn-icon h-7 w-7 text-muted hover:text-pink"
                        >
                          <Trash2 size={13} />
                        </button>
                      </form>
                      <ArrowRight size={13} className="mt-0.5 shrink-0 text-muted" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-3 text-[0.65rem] text-muted">
                No lecture notes yet. Upload a PDF or photo, or paste text above.
              </p>
            )}
          </Card>

          <Suspense
            fallback={
              <Card className="p-5">
                <p className="eyebrow">Practice</p>
                <p className="mt-2 text-[0.65rem] text-muted">Loading practice links…</p>
              </Card>
            }
          >
            <PracticeCards
              subjectId={subject.id}
              cardCount={cardCount}
              dueCount={dueCount}
              difficultCount={difficultCount}
              quizCount={subject.quizzes.length}
            />
          </Suspense>

          <UpcomingTestsCard
            subjectId={subject.id}
            leafCount={leaves.length}
            exam={nextExam}
            exams={subject.exams}
            countdown={countdown}
          />
        </div>
      </div>

      <Suspense>
        <SubjectSettingsCard subject={subject} />
      </Suspense>

      <Suspense>
        <Card className="mt-5 border-pink/25 bg-pink/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow text-pink">Danger zone</p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
                Deleting “{subject.name}” permanently removes its syllabus, topics,
                exams, lecture notes, flashcards, quizzes and open roadmap blocks.
                Completed study history in Analytics stays. This cannot be undone.
              </p>
            </div>
            <ConfirmDeleteDialog
              title={`Delete ${subject.name}`}
              description="This permanently removes the subject with its syllabus, exams, quizzes, flashcards, notes and plan progress. This cannot be undone."
              itemId={subject.id}
              itemName={subject.name}
              triggerLabel="Delete subject"
              className="btn btn-ghost btn-sm shrink-0 text-pink hover:bg-pink/10"
              deleteAction={deleteSubjectAction}
            />
          </div>
        </Card>
      </Suspense>
    </div>
  );
}

/** Practice shortcuts — a small async island so they stream in late. */
async function PracticeCards({
  subjectId,
  cardCount,
  dueCount,
  difficultCount,
  quizCount,
}: {
  subjectId: string;
  cardCount: number;
  dueCount: number;
  difficultCount: number;
  quizCount: number;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Layers size={15} className="text-mint" />
        <p className="eyebrow">Practice from notes &amp; topics</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2">
          <p className="display text-lg font-semibold text-cream">{cardCount}</p>
          <p className="text-[0.55rem] uppercase tracking-[0.12em] text-muted">Total</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2">
          <p className="display text-lg font-semibold text-mint">{dueCount}</p>
          <p className="text-[0.55rem] uppercase tracking-[0.12em] text-muted">Due</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2">
          <p className="display text-lg font-semibold text-pink">{difficultCount}</p>
          <p className="text-[0.55rem] uppercase tracking-[0.12em] text-muted">Tricky</p>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[0.58rem] text-muted">
        {quizCount} quiz{quizCount === 1 ? "" : "zes"} on this subject
      </p>
      <div className="mt-3 space-y-2">
        <Link
          href={`/flashcards/study?subject=${subjectId}`}
          className="btn btn-primary btn-sm w-full"
        >
          <Clock size={12} />
          {dueCount > 0 ? `Review ${dueCount} due` : "Open study mode"}
        </Link>
        <Link
          href={`/flashcards?subject=${subjectId}`}
          className="btn btn-secondary btn-sm w-full"
        >
          <Sparkles size={12} />
          Generate &amp; manage cards
        </Link>
      </div>
      {cardCount === 0 ? (
        <p className="mt-3 text-[0.62rem] leading-relaxed text-muted">
          No cards yet. Generate them from this subject&apos;s notes on the
          flashcards page — every card keeps its topic and page reference.
        </p>
      ) : null}
    </Card>
  );
}

/** Upcoming tests with their selected syllabus topics. */
type ExamRow = {
  id: string;
  name: string;
  date: Date | string;
  examTopics: { topicId: string }[];
};

function UpcomingTestsCard({
  subjectId,
  leafCount,
  exam,
  exams,
  countdown,
}: {
  subjectId: string;
  leafCount: number;
  exam: ExamRow | null;
  exams: ExamRow[];
  countdown: ReturnType<typeof examCountdown>;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-pink" />
          <p className="eyebrow">Upcoming tests</p>
        </div>
        <Link href="/roadmap" className="btn btn-ghost btn-sm text-[0.62rem]">
          Manage
          <ArrowRight size={11} />
        </Link>
      </div>

      {exam ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-pink/20 bg-pink/[0.05] px-3 py-2.5">
            <p className="text-xs font-semibold text-cream">{exam.name}</p>
            <p className="mt-0.5 text-[0.6rem] text-muted">
              {new Date(exam.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              ·{" "}
              <span className={countdown?.urgent ? "text-pink" : "text-mint"}>
                {countdown?.label}
              </span>
            </p>
            <p className="mt-0.5 text-[0.56rem] text-muted">
              {exam.examTopics.length === 0
                ? `All ${leafCount} approved topics`
                : `${exam.examTopics.length} selected topic${
                    exam.examTopics.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>
          {exams.slice(1).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2"
            >
              <p className="truncate text-[0.68rem] text-cream">{entry.name}</p>
              <span className="shrink-0 text-[0.58rem] text-muted">
                {new Date(entry.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
          <p className="text-[0.6rem] leading-relaxed text-muted">
            Only the topics selected on each test are scheduled. The roadmap
            focuses the nearest test and gives the day before an exam to that
            exam alone.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="rounded-xl border border-dashed border-amber/25 bg-amber/[0.05] px-3 py-3 text-[0.65rem] leading-relaxed text-amber">
            This subject is not on the roadmap. Add a dated test and select its
            syllabus topics when you are ready.
          </p>
          <Link
            href={`/roadmap?subject=${subjectId}`}
            className="btn btn-secondary btn-sm mt-2 w-full"
          >
            <Plus size={12} />
            Add a test
          </Link>
        </div>
      )}
    </Card>
  );
}

/** Subject settings render late so the two main sections paint first. */
async function SubjectSettingsCard({
  subject,
}: {
  subject: {
    id: string;
    name: string;
    description: string;
    color: string;
    importance: number;
    difficulty: number;
    prepLevel: string;
  };
}) {
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Subject settings</p>
          <p className="mt-1 text-[0.68rem] text-muted">
            These defaults feed the priority algorithm when a test does not set
            its own values.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[0.62rem] text-muted"
          title="Subject colour"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: colorVar(subject.color) }}
          />
          {subject.color}
        </span>
      </div>

      <form action={updateSubjectAction} className="mt-4 space-y-3">
        <input type="hidden" name="id" value={subject.id} />
        <div>
          <label className="label" htmlFor="subject-name">
            Name
          </label>
          <input
            id="subject-name"
            name="name"
            defaultValue={subject.name}
            required
            maxLength={60}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="subject-description">
            Description
          </label>
          <textarea
            id="subject-description"
            name="description"
            defaultValue={subject.description}
            rows={2}
            maxLength={500}
            placeholder="What this subject covers, which textbook, anything useful."
            className="textarea min-h-[64px]"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="subject-importance">
              Importance
            </label>
            <select
              id="subject-importance"
              name="importance"
              defaultValue={subject.importance}
              className="select"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subject-difficulty">
              Difficulty
            </label>
            <select
              id="subject-difficulty"
              name="difficulty"
              defaultValue={subject.difficulty}
              className="select"
            >
              <option value={1}>Easy</option>
              <option value={2}>Easy+</option>
              <option value={3}>Moderate</option>
              <option value={4}>Difficult</option>
              <option value={5}>Very difficult</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subject-prep">
              Preparation
            </label>
            <select
              id="subject-prep"
              name="prepLevel"
              defaultValue={subject.prepLevel}
              className="select"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.6rem] text-muted">
            Changing these values re-plans open work. Completed sessions are kept.
          </p>
          <button type="submit" className="btn btn-primary btn-sm">
            <CheckCircle2 size={13} />
            Save subject
          </button>
        </div>
      </form>
    </Card>
  );
}
