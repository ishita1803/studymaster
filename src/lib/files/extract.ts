/**
 * Extracts plain text from files uploaded through server actions.
 *
 * Supported: PDF, DOCX, TXT, MD, CSV and photos/scans (PNG, JPG, WEBP).
 * PDFs that contain no selectable text (scanned or handwritten pages) are
 * rendered page-by-page and transcribed with OCR. Everything is read on the
 * server, so uploaded files are never stored — only their text is used for
 * notes, cards and quizzes.
 */

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_SUMMARY,
  extensionOf,
  formatMegabytes,
  isAcceptedFileName,
} from "@/lib/files/constants";
import { mimeTypeForExtension, transcribeImageBytes } from "@/lib/files/ocr";

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/files/constants";

/** Keep prompts and note bodies to a sane size. */
export const MAX_EXTRACTED_CHARS = 200_000;

/** OCR is slow, so cap how many scanned pages we transcribe per upload. */
const MAX_OCR_PAGES = 40;
/** Stop starting new OCR jobs after this long so the action can finish. */
const OCR_TIME_BUDGET_MS = 45_000;
/** Gemini vision calls can run in parallel; Tesseract serialises internally. */
const OCR_CONCURRENCY = 3;
/** Pages with less selectable text than this are treated as scans. */
const MIN_PDF_TEXT_CHARS = 40;
/** Never walk more than this many pages of a very long PDF. */
const MAX_PDF_PAGES = 5000; // Allow processing of very large PDFs without artificial page cap

export type ExtractMethod = "text" | "pdf" | "docx" | "image-ocr" | "pdf-ocr";

export type UploadText = {
  text: string;
  fileName: string | null;
  error: string | null;
  method: ExtractMethod | null;
  /** True when at least part of the text came from OCR. */
  ocr: boolean;
  /** Number of pages/sheets read, when known. */
  pages?: number;
  /** Pages that were not transcribed because the OCR budget ran out. */
  skippedPages?: number;
  /** Non-fatal notice about a partial read. */
  warning?: string | null;
};

function emptyUpload(error: string | null = null): UploadText {
  return {
    text: "",
    fileName: null,
    error,
    method: null,
    ocr: false,
    warning: null,
  };
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "size" in value &&
    typeof (value as File).size === "number"
  );
}

function normaliseBody(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function normalise(text: string) {
  return normaliseBody(text).slice(0, MAX_EXTRACTED_CHARS);
}

async function extractPdf(bytes: Uint8Array): Promise<{
  text: string;
  ocr: boolean;
  pages: number;
  skippedPages: number;
}> {
  const { extractText, getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(result.text) ? result.text : [result.text]).slice(
    0,
    MAX_PDF_PAGES,
  );

  // `parts[index]` keeps page order even though OCR jobs run concurrently.
  // Every page gets a `[[page:N]]` marker so syllabus detection, quiz
  // generation and flashcards know exactly where each line came from.
  const parts: (string | null)[] = new Array(pages.length).fill(null);
  const ocrIndices: number[] = [];
  let usedOcr = false;

  for (let index = 0; index < pages.length; index++) {
    const marker = `\n[[page:${index + 1}]]\n`;
    const pageText = normalise(pages[index] ?? "");
    if (pageText.length >= MIN_PDF_TEXT_CHARS) {
      parts[index] = marker + pageText;
    } else {
      ocrIndices.push(index);
      // Keep any tiny amount of selectable text as a fallback.
      if (pageText) parts[index] = marker + pageText;
    }
  }

  // If a document is almost entirely scans, OCR pages spread across the whole
  // file instead of only the first few.
  const candidates =
    ocrIndices.length <= MAX_OCR_PAGES
      ? ocrIndices
      : Array.from({ length: MAX_OCR_PAGES }, (_, index) =>
          ocrIndices[
            Math.min(
              ocrIndices.length - 1,
              Math.floor((index * ocrIndices.length) / MAX_OCR_PAGES),
            )
          ],
        );

  const deadline = Date.now() + OCR_TIME_BUDGET_MS;
  let skippedPages = ocrIndices.length - candidates.length;
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(OCR_CONCURRENCY, candidates.length) },
    async () => {
      while (true) {
        const position = cursor++;
        if (position >= candidates.length) break;

        const index = candidates[position];
        if (Date.now() > deadline) {
          skippedPages++;
          continue;
        }

        try {
          const image = await renderPageAsImage(pdf, index + 1, {
            canvasImport: () => import("@napi-rs/canvas"),
            scale: 2,
            format: "png",
          });
          const transcribed = await transcribeImageBytes(
            new Uint8Array(image),
            "image/png",
          );
          if (transcribed.text) {
            usedOcr = true;
            parts[index] = normalise(transcribed.text);
          }
        } catch (error) {
          console.error("[studymaster] Could not OCR a PDF page:", error);
        }
      }
    },
  );

  await Promise.all(workers);

  return {
    text: parts
      .map((part, index) => (part ? part : `\n[[page:${index + 1}]]\n`))
      .join("\n\n"),
    ocr: usedOcr,
    pages: pages.length,
    skippedPages,
  };
}

/**
 * Reads an optional file from a FormData field and returns its text.
 * A missing file is not an error; an invalid file returns `error`.
 */
export async function readUploadedText(
  formData: FormData,
  field = "file",
): Promise<UploadText> {
  const value = formData.get(field);
  if (!isFile(value) || value.size === 0) return emptyUpload();

  const name = value.name || "upload";
  const extension = extensionOf(name);

  if (!isAcceptedFileName(name)) {
    return emptyUpload(
      `${name} is not a supported file. Upload ${UPLOAD_SUMMARY}.`,
    );
  }

  if (value.size > MAX_UPLOAD_BYTES) {
    return emptyUpload(
      `${name} is ${formatMegabytes(value.size)} — larger than the ${MAX_UPLOAD_LABEL} limit. Try a smaller file or paste the text.`,
    );
  }

  try {
    let raw = "";
    let method: ExtractMethod = "text";
    let ocr = false;
    let pages: number | undefined;
    let skippedPages = 0;

    if (extension === "pdf") {
      method = "pdf";
      const extracted = await extractPdf(
        new Uint8Array(await value.arrayBuffer()),
      );
      raw = extracted.text;
      ocr = extracted.ocr;
      pages = extracted.pages;
      skippedPages = extracted.skippedPages;
      if (extracted.ocr) method = "pdf-ocr";
    } else if (extension === "docx") {
      method = "docx";
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(await value.arrayBuffer()),
      });
      raw = result.value;
    } else if (
      extension === "png" ||
      extension === "jpg" ||
      extension === "jpeg" ||
      extension === "webp"
    ) {
      method = "image-ocr";
      pages = 1;
      const transcribed = await transcribeImageBytes(
        new Uint8Array(await value.arrayBuffer()),
        mimeTypeForExtension(extension),
      );
      raw = transcribed.text;
      ocr = Boolean(transcribed.text);
    } else {
      raw = await value.text();
    }

    const body = normaliseBody(raw);
    const truncated = body.length > MAX_EXTRACTED_CHARS;
    const text = truncated ? body.slice(0, MAX_EXTRACTED_CHARS) : body;
    if (!text) {
      const isImage = method === "image-ocr";
      return {
        text: "",
        fileName: name,
        error: isImage
          ? `We could not read any text in ${name}. Try a sharper, well-lit photo where the handwriting fills the frame.`
          : `No readable text was found in ${name}. If it is a scan or handwriting, upload it as a photo (PNG, JPG or WEBP) instead.`,
        method,
        ocr: false,
        pages,
        skippedPages,
        warning: null,
      };
    }

    const truncatedNotice = truncated
      ? `This file is longer than the ${Math.round(MAX_EXTRACTED_CHARS / 1000)}k-character reading limit, so the tail was not used.`
      : null;
    const warning =
      [
        skippedPages > 0
          ? `Read ${pages ? pages - skippedPages : "most"} of ${pages ?? "the"} pages in ${name}. ${skippedPages} page${
              skippedPages === 1 ? " was" : "s were"
            } too slow to transcribe — cards and quizzes use everything that was read.`
          : null,
        truncatedNotice,
      ]
        .filter(Boolean)
        .join(" ") || null;

    return {
      text,
      fileName: name,
      error: null,
      method,
      ocr,
      pages,
      skippedPages,
      warning,
    };
  } catch (error) {
    console.error("[studymaster] Upload extraction failed:", error);
    return {
      text: "",
      fileName: name,
      error: `We could not read ${name}. Try another file or paste the text instead.`,
      method: null,
      ocr: false,
      warning: null,
    };
  }
}

/** "Chapter 4 - Cells.pdf" → "Chapter 4 - Cells" */
export function fileTitle(fileName: string | null) {
  if (!fileName) return "";
  return fileName.replace(/\.[^.]+$/, "").trim().slice(0, 120);
}
