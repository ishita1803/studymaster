"use client";

import { useActionState } from "react";
import { AlertCircle, BookMarked, ScanLine, Sparkles } from "lucide-react";
import { UploadField } from "@/components/files/upload-field";
import {
  uploadOfficialSyllabusAction,
  type SubjectUploadState,
} from "@/lib/actions/subject-upload";

const initial: SubjectUploadState = {};

/**
 * The Syllabus section's upload: an OFFICIAL syllabus PDF (or pasted syllabus
 * text). This is the only upload inside a subject that extracts chapters,
 * topics and subtopics — lecture-note uploads never touch the syllabus.
 */
export function SyllabusUploadForm({ subjectId }: { subjectId: string }) {
  const [state, action, pending] = useActionState(
    uploadOfficialSyllabusAction,
    initial,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="subjectId" value={subjectId} />

      <div className="rounded-2xl border border-violet/25 bg-violet/[0.05] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet/15 text-violet">
            <BookMarked size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cream">Upload Official Syllabus</p>
            <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted">
              The official syllabus PDF (or pasted text) is the source of truth.
              Nova extracts an editable chapter → topic → subtopic tree with
              page references, and collapses duplicates across repeats.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="syllabus-title">
              Document title (optional)
            </label>
            <input
              id="syllabus-title"
              name="title"
              maxLength={120}
              placeholder="e.g. AKTU Python Unit 1 syllabus"
              className="input"
            />
          </div>

          <UploadField
            id="syllabus-file"
            hint="PDF, JPG, JPEG, PNG (also DOCX, TXT, MD, CSV, WEBP) · up to 20 MB. Scans use OCR automatically."
          />

          <div>
            <label className="label" htmlFor="syllabus-content">
              Or paste the syllabus
            </label>
            <textarea
              id="syllabus-content"
              name="content"
              rows={4}
              placeholder="Paste the official unit/chapter list so Nova can extract the topic tree."
              className="textarea"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending}
          >
            {pending ? <Sparkles size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {pending ? "Extracting syllabus topics…" : "Extract syllabus topics"}
          </button>

          {pending ? (
            <>
              <div className="progress-track">
                <div className="progress-range" />
              </div>
              <p className="flex items-start gap-2 rounded-xl border border-sky/25 bg-sky/[0.06] px-3 py-2 text-[0.65rem] leading-relaxed text-sky">
                <ScanLine size={13} className="mt-0.5 shrink-0" />
                Reading the file, transcribing scans if needed, and finding chapters,
                topics and subtopics. A large scanned PDF can take up to a minute.
              </p>
            </>
          ) : null}

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-pink/30 bg-pink/10 px-3 py-2 text-[0.65rem] leading-relaxed text-pink"
            >
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
