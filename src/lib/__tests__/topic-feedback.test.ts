import { describe, expect, it } from "vitest";
import {
  blendMastery,
  bucketTopicResults,
  matchTopicId,
  normalizeTopicLabel,
  statusForAccuracy,
  type TopicCandidate,
} from "../topic-feedback";

const topics: TopicCandidate[] = [
  { id: "mitosis", name: "Mitosis", masteryScore: 50 },
  { id: "meiosis", name: "Meiosis", masteryScore: 30 },
  { id: "dna", name: "DNA replication", masteryScore: 70 },
];

describe("normalizeTopicLabel", () => {
  it("collapses punctuation and casing", () => {
    expect(normalizeTopicLabel("  DNA-Replication! ")).toBe("dna replication");
  });
});

describe("matchTopicId", () => {
  it("prefers an exact normalized match", () => {
    expect(matchTopicId("mitosis", topics)).toBe("mitosis");
    expect(matchTopicId("DNA replication", topics)).toBe("dna");
  });

  it("matches a longer label that contains a topic name", () => {
    expect(matchTopicId("Mitosis stages and checkpoints", topics)).toBe("mitosis");
  });

  it("does not match very short topic names inside unrelated labels", () => {
    const short: TopicCandidate[] = [{ id: "rna", name: "RNA", masteryScore: 0 }];
    expect(matchTopicId("RNA polymerase", short)).toBeNull();
  });

  it("falls back to the quiz-level topic when nothing matches", () => {
    expect(matchTopicId("Unknown label", topics, "dna")).toBe("dna");
    expect(matchTopicId("", topics, "meiosis")).toBe("meiosis");
  });
});

describe("bucketTopicResults", () => {
  it("groups a mixed quiz by the topics its questions belong to", () => {
    const buckets = bucketTopicResults(
      [
        { topicLabel: "Mitosis", correct: true },
        { topicLabel: "Mitosis stages", correct: false },
        { topicLabel: "Meiosis", correct: true },
        { topicLabel: "unrelated", correct: false },
      ],
      topics,
    );

    expect(buckets).toEqual([
      { topicId: "mitosis", correct: 1, total: 2 },
      { topicId: "meiosis", correct: 1, total: 1 },
    ]);
  });

  it("uses the fallback topic for untagged questions", () => {
    const buckets = bucketTopicResults(
      [
        { topicLabel: "", correct: true },
        { topicLabel: "", correct: true },
      ],
      topics,
      "dna",
    );

    expect(buckets).toEqual([{ topicId: "dna", correct: 2, total: 2 }]);
  });
});

describe("mastery feedback", () => {
  it("blends prior mastery with the latest accuracy", () => {
    expect(blendMastery(50, 100)).toBe(70);
    expect(blendMastery(80, 20)).toBe(56);
    expect(blendMastery(0, 50)).toBe(20);
  });

  it("maps accuracy to a syllabus status", () => {
    expect(statusForAccuracy(90)).toBe("mastered");
    expect(statusForAccuracy(85)).toBe("mastered");
    expect(statusForAccuracy(70)).toBe("studied");
    expect(statusForAccuracy(59)).toBe("in_progress");
  });
});
