/**
 * Pure helpers that connect quiz results to the shared syllabus.
 *
 * Keeping this logic outside the server action makes it testable: a question's
 * `topicLabel` is matched against the student's real topic names, then mastery
 * is blended so one bad attempt lowers it without erasing prior progress.
 */

export type TopicCandidate = {
  id: string;
  name: string;
  masteryScore: number;
};

export type TopicBucket = {
  topicId: string;
  correct: number;
  total: number;
};

export function normalizeTopicLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Finds the topic a question belongs to. Exact normalized names win; then a
 * conservative partial match (min 4 characters) handles labels such as
 * "Mitosis stages" against the topic "Mitosis". Falls back to the quiz-level
 * topic so untagged questions still move the right topic.
 */
export function matchTopicId(
  label: string,
  topics: TopicCandidate[],
  fallbackId?: string | null,
): string | null {
  const normalized = normalizeTopicLabel(label ?? "");
  if (normalized) {
    const exact = topics.find(
      (topic) => normalizeTopicLabel(topic.name) === normalized,
    );
    if (exact) return exact.id;

    const partial = topics.find((topic) => {
      const name = normalizeTopicLabel(topic.name);
      return (
        name.length >= 4 &&
        (normalized.includes(name) || name.includes(normalized))
      );
    });
    if (partial) return partial.id;
  }

  return fallbackId ?? null;
}

/**
 * Like `matchTopicId`, but also looks for a topic name inside the question or
 * card text. This links local-fallback content (which has no AI topic label) to
 * the same syllabus topics used by the roadmap.
 */
export function matchTopicIdFromText(
  label: string,
  text: string,
  topics: TopicCandidate[],
  fallbackId?: string | null,
): string | null {
  const direct = matchTopicId(label, topics, null);
  if (direct) return direct;

  const normalizedText = normalizeTopicLabel(text ?? "");
  if (normalizedText) {
    const contained = topics.find((topic) => {
      const name = normalizeTopicLabel(topic.name);
      return name.length >= 4 && normalizedText.includes(name);
    });
    if (contained) return contained.id;
  }

  return fallbackId ?? null;
}

/**
 * Groups per-question results by matched topic, so a mixed quiz can update
 * several topics at once instead of only the quiz-level topic.
 */
export function bucketTopicResults(
  results: { topicLabel: string; correct: boolean }[],
  topics: TopicCandidate[],
  fallbackId?: string | null,
): TopicBucket[] {
  const buckets = new Map<string, TopicBucket>();

  for (const result of results) {
    const topicId = matchTopicId(result.topicLabel ?? "", topics, fallbackId);
    if (!topicId) continue;

    const bucket = buckets.get(topicId) ?? { topicId, correct: 0, total: 0 };
    bucket.total += 1;
    if (result.correct) bucket.correct += 1;
    buckets.set(topicId, bucket);
  }

  return [...buckets.values()];
}

/** 60% prior mastery + 40% latest accuracy, rounded to a whole percent. */
export function blendMastery(current: number, accuracy: number) {
  return Math.round(current * 0.6 + accuracy * 0.4);
}

export function statusForAccuracy(accuracy: number) {
  if (accuracy >= 85) return "mastered" as const;
  if (accuracy >= 60) return "studied" as const;
  return "in_progress" as const;
}
