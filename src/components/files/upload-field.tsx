"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Paperclip, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ACCEPT,
  UPLOAD_SUMMARY,
  extensionOf,
  formatMegabytes,
  isAcceptedFileName,
} from "@/lib/files/constants";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/**
 * File input shared by notes, flashcards and quizzes.
 *
 * Validates type and size before the form is submitted, so an oversized file
 * can never hit the server-action body limit and surface as a client error.
 */
export function UploadField({
  id,
  hint,
  className,
}: {
  id: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{
    name: string;
    size: number;
    image: boolean;
  } | null>(null);

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    setPicked(null);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPicked(null);
      setError(null);
      return;
    }

    if (!isAcceptedFileName(file.name)) {
      setPicked(null);
      setError(`${file.name} is not a supported file. Use ${UPLOAD_SUMMARY}.`);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setPicked(null);
      setError(
        `${file.name} is ${formatMegabytes(file.size)}. The limit is ${MAX_UPLOAD_LABEL} — try a smaller file or paste the text.`,
      );
      event.target.value = "";
      return;
    }

    setError(null);
    setPicked({
      name: file.name,
      size: file.size,
      image: IMAGE_EXTENSIONS.includes(extensionOf(file.name)),
    });
  }

  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        <Paperclip size={11} className="mr-1 inline" />
        Upload a file
      </label>
      <input
        ref={inputRef}
        id={id}
        name="file"
        type="file"
        accept={UPLOAD_ACCEPT}
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "input py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-mint/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-mint",
          error && "border-pink/50",
        )}
      />
      <p className="mt-1.5 text-[0.65rem] leading-relaxed text-muted">
        {hint ??
          `${UPLOAD_SUMMARY} · up to ${MAX_UPLOAD_LABEL}. Uploaded text is added to anything you paste.`}
      </p>

      {picked ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.65rem] text-mint">
          <CheckCircle2 size={12} />
          <span className="truncate">
            {picked.name} · {formatMegabytes(picked.size)}
          </span>
          {picked.image ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-lilac/40 bg-lilac/10 px-2 py-0.5 text-[0.6rem] text-lilac">
              <ScanLine size={10} />
              Handwriting OCR
            </span>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="text-[0.65rem] text-muted underline underline-offset-2 hover:text-ink"
          >
            clear
          </button>
        </p>
      ) : null}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-pink/30 bg-pink/10 px-2.5 py-1.5 text-[0.65rem] leading-relaxed text-pink"
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
