/**
 * Per-exam topic rating → scheduler weighting.
 *
 * Students rate every selected topic 1–5 per exam (saved on the exam's
 * ExamTopic rows; legacy exams may still hold "easy"/"medium"/"hard", which
 * normalise to 2/3/4). The roadmap honours those ratings: harder topics
 * receive more study minutes and a higher scheduler priority; easier ones
 * less. Unknown ratings behave like "3" so a legacy exam keeps the historical
 * behaviour.
 */

const MINUTE_FACTORS: Record<string, number> = {
  1: 0.6,
  2: 0.8,
  3: 1,
  4: 1.35,
  5: 1.7,
  // Legacy word ratings → their numeric equivalents.
  easy: 0.8,
  medium: 1,
  hard: 1.5,
};

const SCHEDULER_DIFFICULTIES: Record<string, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  // Legacy word ratings mapped onto the numeric scale.
  easy: 2,
  medium: 3,
  hard: 4,
};

/** Multiply a topic's baseline estimated minutes by its rating. */
export function ratingMinuteFactor(rating?: string | null): number {
  return MINUTE_FACTORS[String(rating ?? "3")] ?? 1;
}

/** Scheduler difficulty (1–5) derived from the rating, overriding syllabus difficulty. */
export function ratingSchedulerDifficulty(
  rating: string | null | undefined,
  fallback: number,
): number {
  const difficulty = SCHEDULER_DIFFICULTIES[String(rating ?? "3")];
  return difficulty ?? fallback;
}
