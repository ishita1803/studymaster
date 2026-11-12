/**
 * Handwriting / scan support.
 *
 * When a Gemini key is configured we ask Gemini's vision model to transcribe
 * the image (it copes far better with handwriting than classic OCR). If that
 * is unavailable or fails, we fall back to a local Tesseract worker, which
 * ships with the English trained data in `tessdata/`.
 */

import path from "node:path";
import os from "node:os";
import { aiEnabled, transcribeImage } from "@/lib/ai/gemini";

export type OcrEngine = "gemini" | "tesseract";

export type OcrResult = {
  text: string;
  engine: OcrEngine | null;
};

/** Cap how long a single image may take so a server action never hangs. */
const OCR_TIMEOUT_MS = 45_000;

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

/**
 * Tesseract can only run one recognition at a time, so serialise jobs instead
 * of letting two uploads collide inside the same worker.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OCR timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        langPath: path.join(process.cwd(), "tessdata"),
        gzip: false,
        cachePath: os.tmpdir(),
        cacheMethod: "none",
        logger: () => {},
      });
    })().catch((error) => {
      // Allow a later attempt to spin up a fresh worker.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function tesseractOcr(image: Uint8Array): Promise<string> {
  return enqueue(async () => {
    try {
      const worker = await withTimeout(getWorker(), OCR_TIMEOUT_MS);
      const { data } = await withTimeout(worker.recognize(Buffer.from(image)), OCR_TIMEOUT_MS);
      return (data.text ?? "").trim();
    } catch (error) {
      console.error("[studymaster] Local OCR failed:", error);
      // The worker may be wedged; recreate it next time.
      workerPromise = null;
      return "";
    }
  });
}

/**
 * Transcribes a handwritten/printed image to text.
 * Gemini vision is tried first when a key exists; Tesseract is the offline
 * fallback, so handwriting support also works in demo mode.
 */
export async function transcribeImageBytes(
  image: Uint8Array,
  mimeType: string,
): Promise<OcrResult> {
  if (aiEnabled()) {
    try {
      const text = await withTimeout(
        transcribeImage(image, mimeType),
        OCR_TIMEOUT_MS,
      );
      if (text && text.trim().length > 0) {
        return { text: text.trim(), engine: "gemini" };
      }
    } catch (error) {
      console.error("[studymaster] Gemini vision transcription failed:", error);
    }
  }

  const text = await tesseractOcr(image);
  return { text, engine: text ? "tesseract" : null };
}

export function mimeTypeForExtension(extension: string) {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}
