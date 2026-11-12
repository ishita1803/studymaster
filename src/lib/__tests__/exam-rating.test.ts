import { describe, expect, it } from "vitest";
import {
  ratingMinuteFactor,
  ratingSchedulerDifficulty,
} from "../exam-rating";

describe("per-exam rating weighting (1–5 scale)", () => {
  it("gives harder ratings more minutes, in increasing steps", () => {
    expect(ratingMinuteFactor("1")).toBe(0.6);
    expect(ratingMinuteFactor("2")).toBe(0.8);
    expect(ratingMinuteFactor("3")).toBe(1);
    expect(ratingMinuteFactor("4")).toBe(1.35);
    expect(ratingMinuteFactor("5")).toBe(1.7);
    for (const rating of [1, 2, 3, 4]) {
      expect(ratingMinuteFactor(String(rating + 1))).toBeGreaterThan(
        ratingMinuteFactor(String(rating)),
      );
    }
  });

  it("treats unknown/missing ratings as the middle value", () => {
    expect(ratingMinuteFactor(null)).toBe(1);
    expect(ratingMinuteFactor(undefined)).toBe(1);
    expect(ratingMinuteFactor("boss")).toBe(1);
  });

  it("still understands legacy Easy/Medium/Hard exams", () => {
    expect(ratingMinuteFactor("easy")).toBe(0.8);
    expect(ratingMinuteFactor("medium")).toBe(1);
    expect(ratingMinuteFactor("hard")).toBe(1.5);
  });

  it("maps ratings onto the 1–5 scheduler difficulty scale", () => {
    expect(ratingSchedulerDifficulty("1", 999)).toBe(1);
    expect(ratingSchedulerDifficulty("2", 999)).toBe(2);
    expect(ratingSchedulerDifficulty("3", 999)).toBe(3);
    expect(ratingSchedulerDifficulty("4", 999)).toBe(4);
    expect(ratingSchedulerDifficulty("5", 999)).toBe(5);
    expect(ratingSchedulerDifficulty("easy", 999)).toBe(2);
    expect(ratingSchedulerDifficulty("medium", 999)).toBe(3);
    expect(ratingSchedulerDifficulty("hard", 999)).toBe(4);
  });

  it("falls back to the syllabus difficulty for unknown ratings", () => {
    expect(ratingSchedulerDifficulty(null, 4)).toBe(3);
    expect(ratingSchedulerDifficulty("weird", 5)).toBe(5);
  });

  it("weights a very-hard topic strictly more than an easy topic", () => {
    const base = 30;
    // The same syllabus topic, rated per exam: the unit test says 5, the
    // final says 2 — minutes follow each exam's own rating.
    expect(Math.round(base * ratingMinuteFactor("5"))).toBe(51);
    expect(Math.round(base * ratingMinuteFactor("2"))).toBe(24);
  });
});
