import { createHash } from "node:crypto";

/**
 * Fingerprint of the documents a syllabus was extracted from.
 *
 * Detection used to re-read and re-parse every document whenever the student
 * pressed "detect" again — expensive, and pointless when no document changed.
 * Actions compare this hash against the stored one and short-circuit when the
 * sources are identical ("already up to date").
 */
export function syllabusSourceHash(
  parts: { id: string; content: string }[],
): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part.id);
    hash.update("\u0000");
    // Normalise the content so line-ending/whitespace edits alone do not
    // force a full reprocess of an unchanged document.
    hash.update(part.content.replace(/\r\n/g, "\n").trim());
    hash.update("\u0001");
  }
  return hash.digest("hex").slice(0, 40);
}

/** Fingerprint of a single note's content. */
export function noteContentHash(content: string | null | undefined): string {
  return syllabusSourceHash([{ id: "note", content: content ?? "" }]);
}
