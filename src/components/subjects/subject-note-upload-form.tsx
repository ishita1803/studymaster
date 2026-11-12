"use client";

import { AlertCircle, NotebookPen, Upload } from "lucide-react";
import { UploadField } from "@/components/files/upload-field";
import { PendingSubmit } from "@/components/ui/pending-progress";
import { uploadSubjectNoteAction } from "@/lib/actions/subject-upload";

/**
 * The Notes section's upload: lecture-note PDFs, photos or pasted text.
 * Notes are independently managed study material — uploading them NEVER
 * extracts a syllabus, edits topics, or touches the roadmap. They are
 * accessible to flashcards and quizzes, which stay grounded in this material.
 */
export function SubjectNoteUploadForm({ subjectId }: { subjectId: string }) {
  return (
    <form action={uploadSubjectNoteAction} className="space-y-3">
      <input type="hidden" name="subjectId" value={subjectId} />

      <div className="rounded-2xl border border-sky/25 bg-sky/[0.05] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky/15 text-sky">
            <NotebookPen size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cream">Upload Lecture Notes</p>
            <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted">
              Add as many lecture-note PDFs, photos or pastes as you like. Notes
              are stored once, linked to syllabus topics where possible, and
              become the material for cards and quizzes — they never change the
              syllabus.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="subject-note-title">
              Note title (optional)
            </label>
            <input
              id="subject-note-title"
              name="title"
              maxLength={120}
              placeholder="e.g. Lecture 6 — Numeric data types"
              className="input"
            />
          </div>

          <UploadField
            id="subject-note-file"
            hint="PDF, JPG, JPEG, PNG (also DOCX, TXT, MD, CSV, WEBP) · up to 20 MB. Scans and handwritten photos use OCR automatically."
          />

          <div>
            <label className="label" htmlFor="subject-note-content">
              Or paste the notes
            </label>
            <textarea
              id="subject-note-content"
              name="content"
              rows={4}
              placeholder="Paste a lecture's text so cards and quizzes can use it."
              className="textarea"
            />
          </div>

          <PendingSubmit
            idleLabel="Add to Notes"
            icon={<Upload size={15} />}
            stages={[
              "Saving the note…",
              "Reading the file…",
              "Transcribing scans if needed…",
            ]}
            className="btn btn-primary w-full"
          />

          <p className="flex items-start gap-2 text-[0.62rem] leading-relaxed text-muted">
            <AlertCircle size={12} className="mt-0.5 shrink-0 text-sky" />
            Extracting text from a scanned PDF may take up to a minute — the note
            appears in this list as soon as it is saved.
          </p>
        </div>
      </div>
    </form>
  );
}