import { describe, expect, it } from "vitest";
import { scheduleCard, type CardState } from "../srs";

const now = new Date(2026, 4, 10, 12, 0, 0);

function card(overrides: Partial<CardState> = {}): CardState {
  return { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, ...overrides };
}

describe("scheduleCard", () => {
  it("sends a new medium card to tomorrow", () => {
    const result = scheduleCard(card(), "medium", now);
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.dueAt.getTime()).toBe(new Date(2026, 4, 11, 12, 0, 0).getTime());
  });

  it("gives easy new cards a three-day head start", () => {
    const result = scheduleCard(card(), "easy", now);
    expect(result.intervalDays).toBe(3);
    expect(result.repetitions).toBe(1);
    expect(result.ease).toBeGreaterThan(2.5);
  });

  it("progresses medium cards through 1 → 3 → longer intervals", () => {
    const first = scheduleCard(card(), "medium", now);
    const second = scheduleCard(first, "medium", now);
    const third = scheduleCard(second, "medium", now);

    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(3);
    expect(third.intervalDays).toBeGreaterThan(3);
    expect(third.repetitions).toBe(3);
  });

  it("resets hard cards and counts a lapse", () => {
    const mature = card({ ease: 2.8, intervalDays: 30, repetitions: 5, lapses: 1 });
    const result = scheduleCard(mature, "hard", now);

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(2);
    expect(result.ease).toBeLessThan(2.8);
  });

  it("never lets ease fall below the floor or rise above the ceiling", () => {
    let low = card({ ease: 1.4, repetitions: 4, intervalDays: 10 });
    for (let i = 0; i < 5; i++) low = scheduleCard(low, "hard", now);
    expect(low.ease).toBeGreaterThanOrEqual(1.3);

    let high = card({ ease: 3.1, repetitions: 4, intervalDays: 10 });
    for (let i = 0; i < 5; i++) high = scheduleCard(high, "easy", now);
    expect(high.ease).toBeLessThanOrEqual(3.2);
  });

  it("caps intervals at three days for shaky topics", () => {
    const result = scheduleCard(card({ intervalDays: 30, repetitions: 5 }), "easy", now, 0.45);
    expect(result.intervalDays).toBeLessThanOrEqual(3);
  });

  it("keeps intervals between 1 and 180 days", () => {
    const huge = scheduleCard(card({ intervalDays: 170, repetitions: 8 }), "easy", now);
    expect(huge.intervalDays).toBeLessThanOrEqual(180);
    expect(huge.intervalDays).toBeGreaterThanOrEqual(1);
  });
});
