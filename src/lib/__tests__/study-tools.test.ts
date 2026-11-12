import { describe, expect, it } from "vitest";
import { definitionsOf, localCards, localQuiz } from "../ai/study-tools";

const SECTIONS = [
  ["Cell Structure", "Organelle", "a specialised part of a cell that performs a specific job"],
  ["Enzymes", "Catalyst", "a substance that speeds up a reaction without being used up"],
  ["Photosynthesis", "Chlorophyll", "the green pigment that absorbs light energy"],
  ["Respiration", "Mitochondria", "the organelle where aerobic respiration releases energy"],
  ["Osmosis", "Osmosis", "the movement of water across a partially permeable membrane"],
  ["Genetics", "Allele", "a version of a gene that controls one characteristic"],
  ["Ecosystems", "Producer", "an organism that makes its own food using light energy"],
  ["Evolution", "Natural selection", "the process where better adapted organisms survive"],
  ["Homeostasis", "Homeostasis", "the maintenance of a stable internal environment"],
  ["Immunity", "Antibody", "a protein produced to neutralise a specific pathogen"],
] as const;

const LONG_SOURCE = SECTIONS.map(([section, term, meaning], index) =>
  [
    `## ${index + 1}. ${section}`,
    `${term} is ${meaning}.`,
    `In ${section}, the key process depends on ${term.toLowerCase()} and is measured carefully.`,
    `A worked example: calculate the rate of ${section.toLowerCase()} when 12 units change in 4 seconds.`,
    `${section} links to the next unit because both share the same underlying mechanism.`,
  ].join("\n"),
).join("\n\n");

describe("definitionsOf", () => {
  it("extracts real definitions from note sentences", () => {
    const definitions = definitionsOf([
      "Photosynthesis is the process by which plants convert light energy into glucose.",
      "Osmosis is the movement of water across a semi-permeable membrane.",
    ]);

    expect(definitions.map((definition) => definition.term)).toEqual([
      "Photosynthesis",
      "Osmosis",
    ]);
  });

  it("does not turn worked examples into definition cards", () => {
    const definitions = definitionsOf([
      "Example 1: Calculate the rate when distance is 100 m and time is 20 s.",
      "Exercise 2: Find the value of x when 2x is 10.",
      "Photosynthesis is the process by which plants convert light energy into glucose.",
    ]);

    expect(definitions.map((definition) => definition.term)).toEqual([
      "Photosynthesis",
    ]);
  });

  it("rejects labelled rows and numeric answers", () => {
    const definitions = definitionsOf([
      "Step 1 is the first part of the method.",
      "Answer: 42 is the final value.",
    ]);

    expect(definitions).toEqual([]);
  });
});

describe("local generation coverage", () => {
  it("spreads flashcards across the whole document instead of the first chapter", () => {
    const cards = localCards(LONG_SOURCE, 15, "Biology");
    const text = cards.map((card) => `${card.front} ${card.back}`).join(" ").toLowerCase();

    expect(cards.length).toBeGreaterThan(0);
    // The last chapter must be represented; a front-to-back fill would miss it.
    expect(text).toContain("antibody");
    expect(text).toContain("organelle");

    const fronts = new Set(cards.map((card) => card.front.toLowerCase()));
    expect(fronts.size).toBe(cards.length);
  });

  it("covers every selected answer type and the whole document", () => {
    const types = ["mcq", "truefalse", "match", "short", "long"] as const;
    const questions = localQuiz(LONG_SOURCE, 12, "Biology", {
      difficulty: "medium",
      questionTypes: [...types],
      formats: ["definition", "factual", "conceptual"],
    });

    expect(questions.length).toBeGreaterThan(0);
    const produced = new Set(questions.map((question) => question.type));
    for (const type of types) {
      expect(produced.has(type)).toBe(true);
    }

    const text = questions
      .map((question) => `${question.prompt} ${question.correctAnswer}`)
      .join(" ")
      .toLowerCase();
    // The first and last chapters must both be represented.
    expect(text).toContain("organelle");
    expect(text).toContain("antibody");
    const termsCovered = SECTIONS.filter(([, term]) =>
      text.includes(term.toLowerCase()),
    ).length;
    expect(termsCovered).toBeGreaterThanOrEqual(6);
  });

  it("never emits an answer type the student did not select", () => {
    const questions = localQuiz(LONG_SOURCE, 8, "Biology", {
      difficulty: "easy",
      questionTypes: ["short"],
      formats: ["definition"],
    });

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((question) => question.type === "short")).toBe(true);
  });

  it("does not create fill-in-the-blank or word-deletion questions", () => {
    const questions = localQuiz(LONG_SOURCE, 12, "Biology", {
      difficulty: "medium",
      questionTypes: ["mcq", "truefalse", "match", "short", "long", "application", "problem"],
      formats: ["definition", "factual", "conceptual"],
    });

    for (const question of questions) {
      expect(question.type).not.toBe("fillblank");
      expect(question.prompt).not.toMatch(/_{3,}/);
      expect(question.prompt.toLowerCase()).not.toContain("fill in the blank");
    }
  });
});
