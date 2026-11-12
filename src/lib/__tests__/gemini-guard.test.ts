import { describe, expect, it } from "vitest";
import {
  AiQuotaError,
  QuotaGuard,
  aiFriendlyMessage,
  errorInfo,
  type QuotaGuardOptions,
} from "@/lib/ai/gemini";

/** Every test guard gets a dummy client so no API key is needed. */
function newGuard(options: QuotaGuardOptions = {}) {
  return new QuotaGuard({ client: {}, ...options });
}

/** A tiny virtual clock so backoff/window tests never really sleep. */
function virtualClock() {
  const state = { now: 0 };
  const clock = {
    nowMs: () => state.now,
    sleepMs: async (ms: number) => {
      state.now += ms;
    },
    get now() {
      return state.now;
    },
  };
  return clock;
}

function quotaError() {
  return new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan."}}',
  );
}

function unavailableError() {
  return new Error(
    '{"error":{"code":503,"message":"This model is currently experiencing high demand."}}',
  );
}

const okRun = (ai: unknown, model: string) => Promise.resolve(`${model}:ok`);

describe("QuotaGuard", () => {
  it("runs requests strictly one at a time when concurrency is 1", async () => {
    const guard = newGuard({ concurrency: 1, rpm: 1000 });

    const order: string[] = [];
    let running = false;

    const attempt = async (tag: string) =>
      guard.run("m", async () => {
        expect(running, "two requests must never overlap").toBe(false);
        running = true;
        order.push(tag);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running = false;
        return tag;
      });

    await Promise.all([attempt("a"), attempt("b"), attempt("c")]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("concurrency above one still caps parallel work", async () => {
    let inFlight = 0;
    let peak = 0;
    const guard = newGuard({ concurrency: 2, rpm: 1000 });

    await Promise.all(
      Array.from({ length: 6 }, () =>
        guard.run("m", async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return true;
        }),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("shares identical in-flight requests through dedupe keys", async () => {
    const guard = newGuard({ concurrency: 1, rpm: 1000 });
    const key = QuotaGuard.key("same", "request");

    const [a, b] = await Promise.all([
      guard.schedule(key, "m", okRun),
      // The first request still holds the slot; this one must dedupe onto it.
      guard.schedule(key, "m", okRun),
    ]);

    expect(a).toBe(b);
    expect(guard.snapshot().sent).toBe(1);
    expect(guard.snapshot().dedupedCalls).toBe(1);
  });

  it("does not raise an unhandled rejection when a tracked in-flight request fails", async () => {
    const guard = newGuard({ concurrency: 1, rpm: 1000 });
    const key = QuotaGuard.key("failing", "request");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(
        guard.schedule(key, "m", () => Promise.reject(new Error("boom"))),
      ).rejects.toThrow("boom");
      // failure path is fully caught above — give microtasks a chance to
      // surface any stray rejection from the inflight-tracked copy.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("spreads sends across the rolling RPM window", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 2,
      windowMs: 60_000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });

    await guard.run("m", okRun);
    await guard.run("m", okRun);
    const before = clock.now;
    await guard.run("m", okRun); // must have waited for the window to age out

    expect(guard.snapshot().sent).toBe(3);
    expect(clock.now - before).toBe(60_000);
  });

  it("retries rate limits with exponential backoff", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 1000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });

    let attempts = 0;
    const result = await guard.run("m", async () => {
      attempts += 1;
      if (attempts < 3) throw quotaError();
      return "recovered";
    });

    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
    expect(guard.snapshot().rateLimitedRetries).toBe(2);
    // first retry 5s, second retry 10s (exponential base)
    expect(clock.now).toBe(15_000);
  });

  it("uses the server's retryDelay when it is larger than the exponential step", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 1000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });

    let attempts = 0;
    await guard.run("m", async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error(
          '{"error":{"code":429,"message":"quota exceeded","details":[]},"retryDelay": "27s"}',
        );
      }
      return "done";
    });

    expect(clock.now).toBe(27_000);
  });

  it("gives up after four attempts and throws the quota message", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 1000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });

    let attempts = 0;
    await expect(
      guard.run("m", async () => {
        attempts += 1;
        throw quotaError();
      }),
    ).rejects.toBeInstanceOf(AiQuotaError);

    expect(attempts).toBeLessThanOrEqual(4);
    expect(guard.snapshot().quotaAborts).toBe(1);
  });

  it("never retries on non-rate-limit errors", async () => {
    const guard = newGuard({ concurrency: 1, rpm: 1000 });

    let attempts = 0;
    await expect(
      guard.run("m", async () => {
        attempts += 1;
        throw unavailableError();
      }),
    ).rejects.toThrow(/high demand/);

    expect(attempts).toBe(1);
    expect(guard.snapshot().rateLimitedRetries).toBe(0);
  });

  it("aborts immediately on a per-day quota rejection (nothing to wait for)", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 1000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });
    const daily = new Error(
      '{"error":{"code":429,"message":"GenerateRequestsPerDayPerProjectPerModel-FreeTier: limit exceeded, quota metric generate_content_free_tier_requests has a limit: 20"}}',
    );

    let attempts = 0;
    await expect(
      guard.run("m", async () => {
        attempts += 1;
        throw daily;
      }),
    ).rejects.toMatchObject({ reason: "daily" });

    expect(attempts).toBe(1);
    expect(guard.snapshot().rateLimitedRetries).toBe(0);
    expect(guard.snapshot().quotaAborts).toBe(1);
  });

  it("keeps retrying a per-MINUTE limit instead of aborting the day", async () => {
    const clock = virtualClock();
    const guard = newGuard({
      concurrency: 1,
      rpm: 1000,
      nowMs: clock.nowMs,
      sleepMs: clock.sleepMs,
    });
    // Free tiers publish several metrics per 429 body; "limit: 20" here is a
    // per-minute limit and one minute of waiting genuinely recovers it.
    const perMinute = new Error(
      '{"error":{"code":429,"message":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier: limit exceeded, quota metric generate_content_free_tier_requests has a limit: 20"}}',
    );

    let attempts = 0;
    const result = await guard.run("m", async () => {
      attempts += 1;
      if (attempts === 1) throw perMinute;
      return "recovered";
    });

    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
    expect(guard.snapshot().quotaAborts).toBe(0);
    expect(guard.snapshot().rateLimitedRetries).toBe(1);
  });

  it("classifies quota bodies strictly: PerDay = daily, PerMinute = retryable", () => {
    const daily = errorInfo(
      new Error(
        '{"error":{"code":429,"message":"You exceeded your current quota. PerDay limit exceeded."}}',
      ),
    );
    expect(daily.isDailyQuota).toBe(true);

    const perMinute = errorInfo(
      new Error(
        '{"error":{"code":429,"message":"PerMinute limit exceeded."}}',
      ),
    );
    expect(perMinute.isDailyQuota).toBe(false);
    expect(perMinute.isRateLimited).toBe(true);

    // A plain 429 with an hours-long retryDelay is de-facto daily.
    const hours = errorInfo(
      new Error(
        '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan.","details":[]},"retryDelay": "7200s"}',
      ),
    );
    expect(hours.isDailyQuota).toBe(true);
    expect(hours.suggestedWaitSec).toBe(7200);

    // A plain 429 (what the deadlock misread as daily before) stays retryable.
    const plain = errorInfo(quotaError());
    expect(plain.isDailyQuota).toBe(false);
    expect(plain.isRateLimited).toBe(true);
  });

  it("classifies the verbatim daily body captured live as daily (spaced wording, sloppy retry hint)", () => {
    // Verbatim body recorded by prisma/_quota-autopsy.mts on 2026-11-10.
    const live = errorInfo(
      new Error(
        'ApiError: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits. Please retry in 19h33m53.026552205s.","status":"RESOURCE_EXHAUSTED"}}',
      ),
    );
    expect(live.isRateLimited).toBe(true);
    expect(live.isDailyQuota).toBe(true);
    expect(live.suggestedWaitSec).toBeCloseTo(19 * 3600 + 33 * 60 + 53, 0);
  });

  it("surfaces friendly, non-technical messages", () => {
    expect(aiFriendlyMessage(quotaError())).toContain("quota");
    expect(aiFriendlyMessage(unavailableError())).toContain("overloaded");
    expect(aiFriendlyMessage(new Error("socket hang up"))).toContain("failed");
  });
});
