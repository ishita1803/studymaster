import { addDays } from "date-fns";

export type Rating = "easy" | "medium" | "hard";

export type CardState = {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
};

export type ScheduledCard = CardState & {
  dueAt: Date;
  lastRating: Rating;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * SM-2 inspired scheduler with three friendly ratings.
 *
 * easy   → longer interval, ease up
 * medium → standard progression (1d → 3d → interval × ease)
 * hard   → reset to 1 day, ease down, lapse counted
 *
 * If recent quiz accuracy for the topic is under 60%, the interval is capped
 * at 3 days so shaky material comes back sooner.
 */
export function scheduleCard(
  card: CardState,
  rating: Rating,
  now: Date = new Date(),
  topicAccuracy?: number,
): ScheduledCard {
  let ease = card.ease || 2.5;
  let intervalDays = card.intervalDays || 0;
  let repetitions = card.repetitions || 0;
  let lapses = card.lapses || 0;

  if (rating === "hard") {
    ease = Math.max(1.3, ease - 0.2);
    intervalDays = 1;
    repetitions = 0;
    lapses += 1;
  } else if (rating === "medium") {
    ease = Math.max(1.3, ease - 0.05);
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * ease);
    repetitions += 1;
  } else {
    ease = Math.min(3.2, ease + 0.1);
    if (repetitions === 0) intervalDays = 3;
    else if (repetitions === 1) intervalDays = 7;
    else intervalDays = Math.round(intervalDays * ease * 1.15);
    repetitions += 1;
  }

  if (typeof topicAccuracy === "number" && topicAccuracy < 0.6) {
    intervalDays = Math.min(intervalDays, 3);
  }

  intervalDays = clamp(intervalDays, 1, 180);

  return {
    ease: Math.round(ease * 100) / 100,
    intervalDays,
    repetitions,
    lapses,
    dueAt: addDays(now, intervalDays),
    lastRating: rating,
  };
}

export const RATING_META: Record<Rating, { label: string; hint: string; color: string }> = {
  hard: { label: "Hard", hint: "Bring it back tomorrow", color: "pink" },
  medium: { label: "Medium", hint: "A few days", color: "amber" },
  easy: { label: "Easy", hint: "Push it further out", color: "mint" },
};
