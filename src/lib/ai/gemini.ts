import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";

/**
 * Gemini access with a hard quota guard.
 *
 * The free tier allows a small number of requests per minute (and per day)
 * *per model*. Before this guard existed, one syllabus upload fired 10–20
 * requests (one per chapter plus an automatic retry), and every 429 was
 * amplified by the model-fallback chain — the account exhausted its quota on
 * the first document and every later page turned into 429 noise.
 *
 * The guard enforces, process-wide:
 * - ONE concurrent request (`GEMINI_MAX_CONCURRENCY`, default 1);
 * - a rolling 60 s window with at most `GEMINI_RPM` (default 5) requests;
 * - exponential backoff on 429/RESOURCE_EXHAUSTED honouring the server's own
 *   `retryDelay`, with hard attempt/time caps and a clear final error;
 * - in-flight deduplication: identical concurrent calls share one request;
 * - model fallback for genuine model-name errors, transient provider
 *   503/500 "high demand" outages (free), and **daily** per-model quotas —
 *   each model in the chain has its own separate free allowance, so when one
 *   model's day is spent the next one takes over. Per-minute limits never
 *   trigger the chain (retrying in place recovers them), which keeps the
 *   chain from duplicating requests for nothing.
 */

/**
 * Ordered model chain, each with its own separate free-tier allowance. The
 * configured model leads; the rest recover from a spent daily quota or an
 * overloaded/unavailable model without needing a new API key. Verified live
 * against this key 2026-11-10: gemini-3-flash-preview / 3.5-flash-lite /
 * 3.1-flash-lite answered 200, gemini-2.5-* are discontinued (404), so the
 * chain keeps 3.x generation models only.
 */
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;
const CONFIGURED_MODEL = process.env.GEMINI_MODEL?.trim();
export const MODEL = CONFIGURED_MODEL || FALLBACK_MODELS[0];

export class AiQuotaError extends Error {
  /** "daily" = this model's per-day allowance is spent (other models may work). */
  readonly reason: "daily" | "rate" | "budget";
  constructor(
    message: string,
    reason: "daily" | "rate" | "budget" = "rate",
  ) {
    super(message);
    this.name = "AiQuotaError";
    this.reason = reason;
  }
}

/** The friendly, non-technical message shown to students. */
export const QUOTA_MESSAGE =
  "Gemini's request quota is used up for now. Wait a minute or two and try " +
  "again — your subjects, notes and progress are safe and nothing was lost.";

/** Parses a human-friendly message out of any AI failure. */
export function aiFriendlyMessage(error: unknown): string {
  const info = errorInfo(error);
  // Every free model's daily allowance is spent: only a reset (or a paid plan)
  // fixes that today — say so honestly instead of "wait a minute".
  if (error instanceof AiQuotaError && error.reason === "daily") {
    return (
      "Today's free AI quota is used up on every available Gemini model. " +
      "Generation switches to the built-in engine, nothing is lost, and the " +
      "quota resets automatically tomorrow."
    );
  }
  if (error instanceof AiQuotaError || info.isRateLimited) return QUOTA_MESSAGE;
  if (info.isUnavailable) {
    return (
      "Gemini is temporarily overloaded (high demand). Your material was " +
      "processed with the built-in engine instead, or you can retry in a moment."
    );
  }
  return "The AI request failed. Please try again in a moment.";
}

/* ------------------------------------------------------------------ */
/* Quota guard                                                         */
/* ------------------------------------------------------------------ */

export type GuardOptions = {
  concurrency: number;
  rpm: number;
  windowMs: number;
  nowMs: () => number;
  sleepMs: (ms: number) => Promise<void>;
};

/** Runtime options: resolved guard settings plus the optional test client. */
export type QuotaGuardOptions = Partial<GuardOptions> & {
  /** Test seam: a stand-in client so guard logic is testable without a key. */
  client?: unknown;
};

type GuardRuntimeOptions = Required<GuardOptions> & {
  client?: unknown;
};

export type AiGuardStats = {
  sent: number;
  rateLimitedRetries: number;
  dedupedCalls: number;
  quotaAborts: number;
};

const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 60_000;
const ATTEMPT_BUDGET_MS = 100_000;

const DEFAULT_OPTIONS: Required<GuardOptions> = {
  concurrency: Math.max(1, Number(process.env.GEMINI_MAX_CONCURRENCY ?? 1) || 1),
  rpm: Math.max(1, Number(process.env.GEMINI_RPM ?? 5) || 5),
  windowMs: 60_000,
  nowMs: () => Date.now(),
  sleepMs: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Release = () => void;

/**
 * The single process-wide gate every Gemini request passes through.
 *
 * `acquire()` hands out at most `concurrency` slots at a time (FIFO) and is
 * the ONLY place requests enter. A slot holder first waits for a free slot
 * in the rolling RPM window, then runs its request with exponential-backoff
 * retries up to `MAX_ATTEMPTS` within `ATTEMPT_BUDGET_MS`, then releases the
 * slot. Streaming callers hold their slot for the whole stream.
 */
export class QuotaGuard {
  private options: GuardRuntimeOptions;
  private active = 0;
  private waiting: Array<() => void> = [];
  private sentAt: number[] = [];
  private inflight = new Map<string, Promise<unknown>>();
  private stats: AiGuardStats = {
    sent: 0,
    rateLimitedRetries: 0,
    dedupedCalls: 0,
    quotaAborts: 0,
  };

  constructor(options?: QuotaGuardOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as GuardRuntimeOptions;
  }

  snapshot(): AiGuardStats {
    return { ...this.stats };
  }

  /** SHA-256 dedup key for a request shape. */
  static key(...parts: unknown[]): string {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }

  /** Resolves with a slot release function. FIFO when concurrency is 1. */
  acquire(): Promise<Release> {
    return new Promise<Release>((resolveRelease) => {
      this.waiting.push(() => {
        resolveRelease(() => {
          this.active -= 1;
          this.pump();
        });
      });
      this.pump();
    });
  }

  private pump() {
    while (this.active < this.options.concurrency && this.waiting.length > 0) {
      this.active += 1;
      const next = this.waiting.shift();
      next?.();
    }
  }

  /**
   * Queued, deduplicated, retried request. Identical in-flight requests
   * (same key) share one promise instead of sending a second one.
   */
  schedule<T>(
    key: string | null,
    model: string,
    run: (ai: GoogleGenAI, model: string) => Promise<T>,
  ): Promise<T> {
    if (key) {
      const existing = this.inflight.get(key) as Promise<T> | undefined;
      if (existing) {
        this.stats.dedupedCalls += 1;
        return existing;
      }
    }

    const attempt = this.run(model, run);
    if (key) {
      const tracked = attempt.finally(() => {
        this.inflight.delete(key);
      }) as Promise<T>;
      this.inflight.set(key, tracked);
      // The stored copy must not raise its own unhandled rejection when the
      // original attempt is already awaited elsewhere — otherwise a single
      // failed AI request (503, parse error, 429) crashes the whole process.
      tracked.catch(() => undefined);
    }

    return attempt;
  }

  /**
   * Takes a slot, waits for the RPM window, then retries `run` on
   * rate-limit errors with exponential backoff (server-suggested delays are
   * honoured). Any other error propagates immediately.
   */
  async run<T>(
    model: string,
    attemptFn: (ai: GoogleGenAI, model: string) => Promise<T>,
  ): Promise<T> {
    const release = await this.acquire();
    try {
      // Tests inject a dummy client through the options seam; production
      // resolves the shared `@google/genai` client (or null without a key).
      const ai =
        this.options.client !== undefined
          ? (this.options.client as GoogleGenAI)
          : requireClient();
      if (!ai) throw new AiQuotaError(QUOTA_MESSAGE);

      await this.reserveWindow();
      const budgetStart = this.options.nowMs();
      let attempt = 0;

      while (true) {
        attempt += 1;
        this.stats.sent += 1;
        this.sentAt.push(this.options.nowMs());
        try {
          return await attemptFn(ai, model);
        } catch (error) {
          const info = errorInfo(error);
          if (!info.isRateLimited) throw error;
          if (info.isDailyQuota) {
            // Nothing to wait for on THIS model: its day's request budget is
            // spent. The caller may continue the model chain (every Gemini
            // model has its own separate free allowance).
            this.stats.quotaAborts += 1;
            throw new AiQuotaError(QUOTA_MESSAGE, "daily");
          }

          const delay = Math.min(
            BACKOFF_CAP_MS,
            suggestedDelay(error) ?? BACKOFF_BASE_MS * 2 ** (attempt - 1),
          );
          const elapsed = this.options.nowMs() - budgetStart;
          if (attempt >= MAX_ATTEMPTS || elapsed + delay > ATTEMPT_BUDGET_MS) {
            this.stats.quotaAborts += 1;
            throw new AiQuotaError(QUOTA_MESSAGE);
          }

          this.stats.rateLimitedRetries += 1;
          console.warn(
            `[nova] rate-limited, attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${Math.round(delay / 1000)}s: ${info.message.slice(0, 240)}`,
          );
          await this.options.sleepMs(delay);
        }
      }
    } finally {
      release();
    }
  }

  /** Waits until a free slot exists in the rolling RPM window (tests use). */
  async reserveWindow() {
    const { nowMs, sleepMs, rpm, windowMs } = this.options;
    const windowStart = nowMs() - windowMs;
    this.sentAt = this.sentAt.filter((at) => at > windowStart);

    if (this.sentAt.length < rpm) return;

    // Wait for the oldest request in the window to age out.
    const waitUntil = this.sentAt[0] + windowMs;
    const wait = Math.max(0, waitUntil - nowMs());
    if (wait > 0) await sleepMs(wait);
  }
}

/* ------------------------------------------------------------------ */
/* Error classification                                                */
/* ------------------------------------------------------------------ */

type ErrorInfo = {
  status: number | null;
  message: string;
  isRateLimited: boolean;
  isDailyQuota: boolean;
  isUnavailable: boolean;
  isModelNotFound: boolean;
  suggestedWaitSec: number | null;
};

/** Classifies a Gemini API failure (exported for the classification tests). */
export function errorInfo(error: unknown): ErrorInfo {
  const raw =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const message = raw.replace(/\s+/g, " ").slice(0, 800);

  // @google/genai errors often embed the full API JSON body in the message.
  let status: number | null = null;
  if (/"error"\s*:\s*\{/.test(message)) {
    try {
      const parsed = JSON.parse(message.slice(message.indexOf("{"))) as {
        error?: { code?: number };
      };
      if (typeof parsed.error?.code === "number") status = parsed.error.code;
    } catch {
      // Fall through to the plain status-code match.
    }
  }
  if (status === null) {
    const codeMatch = /(?:^|[^0-9])(\d{3})(?![0-9])/.exec(message);
    if (codeMatch) {
      const code = Number(codeMatch[1]);
      if (code >= 400 && code < 600) status = code;
    }
  }

  const isRateLimited =
    status === 429 ||
    /RESOURCE_EXHAUSTED|exceeded your current quota|rate.?limit/i.test(message);

  // A per-DAY quota rejection cannot recover within this process — waiting
  // does nothing until the provider resets its daily allowance. Identification
  // must be strict: the same 429 body often lists several `limit: N` metrics,
  // and a per-MINUTE limit (limit: 10/20 for some models) MUST still be
  // retried in place. Real daily bodies say "requests per day limit exceeded"
  // (spaced form) and/or "Please retry in 19h33m53s" — hours-long waits.
  const mentionsPerMinute = /PerMinute|per minute/i.test(message);
  const mentionsPerDay =
    /\bper day\b/i.test(message) || /PerDay|per-day|daily quota/i.test(message);

  // RetryInfo inside the error body suggests e.g. `retryDelay": "27s"`.
  // The generateContent REST error instead says "Please retry in 19h33m53s"
  // inside the message field — parse both forms into seconds.
  const delayMatch = /retryDelay["\s:]*"?(\d+(?:\.\d+)?)s"?/i.exec(message);
  const suggestedWaitSec = delayMatch
    ? Number(delayMatch[1])
    : parseSloppyRetryHint(message);
  const hugeWait = suggestedWaitSec !== null && suggestedWaitSec >= 3_600;
  const isDailyQuota =
    (mentionsPerDay && !mentionsPerMinute) ||
    (!mentionsPerMinute && !mentionsPerDay && hugeWait);
  const isUnavailable =
    status === 503 ||
    status === 500 ||
    /UNAVAILABLE|overloaded|high demand/i.test(message);
  const isModelNotFound =
    status === 404 ||
    /NOT_FOUND|not found for API version|does not have access to model/i.test(message);

  return {
    status,
    message,
    isRateLimited,
    isDailyQuota,
    isUnavailable,
    isModelNotFound,
    suggestedWaitSec,
  };
}

/**
 * Parses the generateContent REST wording "Please retry in 19h33m53.02s"
 * (the @google/genai SDK's own RetryInfo field is absent in that shape).
 */
function parseSloppyRetryHint(message: string): number | null {
  const hint =
    /\bretry in\s+(\d+)h\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(message);
  if (!hint) return null;
  const hours = Number(hint[1]);
  if (!Number.isFinite(hours)) return null;
  return hours * 3600 + Number(hint[2] ?? 0) * 60 + Number(hint[3] ?? 0);
}

function suggestedDelay(error: unknown): number | null {
  const sec = errorInfo(error).suggestedWaitSec;
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return null;
  return sec * 1000;
}

/* ------------------------------------------------------------------ */
/* Client + public API                                                 */
/* ------------------------------------------------------------------ */

let client: GoogleGenAI | null = null;
const guard = new QuotaGuard();

export function aiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function aiModel() {
  return MODEL;
}

/** Live guard statistics, for quota reporting. */
export function aiGuardStats() {
  return guard.snapshot();
}

function requireClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

function modelChain() {
  return [...new Set([MODEL, ...FALLBACK_MODELS].filter(Boolean))];
}

function isFallbackWorthy(error: unknown) {
  const info = errorInfo(error);
  // The fallback chain recovers from a stale/wrong GEMINI_MODEL value and
  // (once per model at most) from a transient provider 503/500 "high demand"
  // outage, which does not consume quota. Per-minute rate limits (429) are
  // still retried in place instead — waiting a minute is cheaper than
  // duplicating the request across every model name.
  return info.isModelNotFound || info.isUnavailable;
}

function isWorthAnotherModel(error: unknown) {
  // A per-DAY quota abort means THIS model's free allowance is spent. Every
  // other model in the chain has its own allowance, so fall through once per
  // model instead of giving up. Per-minute limits stay on the same model.
  return error instanceof AiQuotaError && error.reason === "daily";
}

/**
 * Runs one Generation request through the quota guard, with model fallback
 * for name errors, transient provider 503/500 outages (which do not consume
 * quota, so one retry on another model is safe), and spent DAILY per-model
 * quotas (each model has its own allowance). A per-minute rate-limited call
 * retries in place; it never tries other models.
 */
async function guarded<T>(
  label: string,
  run: (ai: GoogleGenAI, model: string) => Promise<T>,
  dedupeParts: unknown[],
): Promise<T | null> {
  if (!aiEnabled()) return null;

  let lastError: unknown = null;

  for (const model of modelChain()) {
    try {
      return await guard.schedule(
        QuotaGuard.key(label, model, dedupeParts),
        model,
        run,
      );
    } catch (error) {
      if (error instanceof AiQuotaError) {
        if (isWorthAnotherModel(error)) {
          console.error(
            `[nova] ${label}: ${model}'s daily quota is spent — trying the next model in the chain.`,
          );
          lastError = error;
          continue;
        }
        throw error;
      }
      lastError = error;
      const summary = error instanceof Error ? error.message : String(error);
      console.error(
        `[nova] ${label} failed with ${model}: ${summary.replace(/\s+/g, " ").slice(0, 240)}`,
      );
      if (!isFallbackWorthy(error)) throw error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

export function generateText(
  prompt: string,
  systemInstruction: string,
  maxOutputTokens = 1600,
): Promise<string | null> {
  return guarded<string | null>(
    "Gemini text generation",
    async (ai, model) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens,
        },
      });
      return response.text?.trim() || null;
    },
    [prompt, systemInstruction, maxOutputTokens, "text"],
  );
}

export function generateJson<T>(
  prompt: string,
  systemInstruction: string,
  responseSchema: unknown,
  maxOutputTokens = 2400,
): Promise<T | null> {
  return guarded<T | null>(
    "Gemini JSON generation",
    async (ai, model) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.5,
          responseMimeType: "application/json",
          responseSchema: responseSchema as never,
          maxOutputTokens,
        },
      });

      const text = response.text?.trim();
      if (!text) return null;
      // A truncated or malformed model response is unusable, not fatal: the
      // caller (batch loop, study synthesis) falls back to its local portion.
      try {
        return JSON.parse(text) as T;
      } catch {
        console.error("[nova] Gemini returned malformed JSON; treating as empty.");
        return null;
      }
    },
    [prompt, systemInstruction, responseSchema, maxOutputTokens, "json"],
  );
}

const TRANSCRIBE_INSTRUCTION =
  "You transcribe study material from photos and scans. Return only the text you can see, " +
  "preserving headings, bullet points and equations as plain text. Handwriting can be messy: " +
  "make your best faithful reading, keep line breaks sensible, and never add commentary, " +
  "summaries or invented content. If a word is illegible, write [illegible].";

export function transcribeImage(
  image: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  return guarded<string | null>(
    "Gemini vision transcription",
    async (ai, model) => {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: "Transcribe this page of study notes." },
              {
                inlineData: {
                  mimeType,
                  data: Buffer.from(image).toString("base64"),
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: TRANSCRIBE_INSTRUCTION,
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      });
      return response.text?.trim() || null;
    },
    ["vision", mimeType, image.byteLength],
  );
}

/**
 * Streams Nova chat answers. The slot is held for the whole stream, so
 * tokens flow live and a browser cannot hold two concurrent streams.
 */
export async function* streamText(
  prompt: string,
  systemInstruction: string,
): AsyncGenerator<string> {
  if (!aiEnabled()) return;

  const release = await guard.acquire();
  let opened = false;
  try {
    for (const model of modelChain()) {
      let response: AsyncIterable<{ text?: string | undefined }>;
      try {
        response = await guard.run(model, (ai, liveModel) =>
          ai.models.generateContentStream({
            model: liveModel,
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.75,
              maxOutputTokens: 1200,
            },
          }),
        );
        opened = true;
      } catch (error) {
        if (error instanceof AiQuotaError) {
          // A spent daily quota on one model can still be answered by the
          // next model in the chain; a per-minute limit is not worth it.
          if (isWorthAnotherModel(error)) continue;
          return;
        }
        const summary = error instanceof Error ? error.message : String(error);
        console.error(
          `[nova] Gemini streaming failed with ${model}: ${summary.replace(/\s+/g, " ").slice(0, 240)}`,
        );
        if (!isFallbackWorthy(error)) return;
        continue;
      }

      // Once tokens have started, retrying another model would duplicate the
      // answer, so consume to the end and stop.
      for await (const chunk of response) {
        if (chunk.text) yield chunk.text;
      }
      return;
    }
  } finally {
    release();
    void opened;
  }
}
