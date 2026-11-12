import { describe, expect, it } from "vitest";
import {
  QUIZ_QUESTION_TYPES,
  matchPairProblem,
  mcqOptionProblem,
  normalizeQuizQuestion,
  normalizeQuizQuestions,
  questionTypeLabel,
} from "../quiz-rules";

describe("normalizeQuizQuestion", () => {
  it("keeps a valid multiple-choice question with four options", () => {
    const question = normalizeQuizQuestion({
      type: "mcq",
      prompt: "Which phase of mitosis comes after metaphase?",
      options: ["Anaphase", "Prophase", "Telophase", "Interphase"],
      correctAnswer: "Anaphase",
      explanation: "Chromatids separate during anaphase.",
    });

    expect(question?.type).toBe("mcq");
    expect(question?.options).toHaveLength(4);
    expect(question?.correctAnswer).toBe("Anaphase");
  });

  it("rejects a multiple-choice question with fewer than four options", () => {
    expect(
      normalizeQuizQuestion({
        type: "mcq",
        prompt: "Which phase comes after metaphase?",
        options: ["Anaphase", "Prophase", "Telophase"],
        correctAnswer: "Anaphase",
      }),
    ).toBeNull();
  });

  it("rejects duplicate options", () => {
    expect(
      normalizeQuizQuestion({
        type: "mcq",
        prompt: "Which phase comes after metaphase?",
        options: ["Anaphase", "Anaphase", "Prophase", "Telophase"],
        correctAnswer: "Anaphase",
      }),
    ).toBeNull();
  });

  it("resolves a letter answer to the exact option text", () => {
    const question = normalizeQuizQuestion({
      type: "mcq",
      prompt: "Which phase comes after metaphase?",
      options: ["Prophase", "Anaphase", "Telophase", "Interphase"],
      correctAnswer: "B",
    });

    expect(question?.correctAnswer).toBe("Anaphase");
  });

  it("forces exactly True and False for true/false questions", () => {
    const question = normalizeQuizQuestion({
      type: "truefalse",
      prompt: "Osmosis moves water across a partially permeable membrane.",
      options: ["Yes", "No"],
      correctAnswer: "true",
    });

    expect(question?.options).toEqual(["True", "False"]);
    expect(question?.correctAnswer).toBe("True");
  });

  it("removes options from short-answer questions", () => {
    const question = normalizeQuizQuestion({
      type: "short",
      prompt: "What is osmosis?",
      options: ["Water movement"],
      correctAnswer: "The movement of water across a partially permeable membrane.",
    });

    expect(question?.options).toEqual([]);
  });

  it("stores a hidden mapping and shuffled right options for match questions", () => {
    const question = normalizeQuizQuestion({
      type: "match",
      prompt: "Match each organelle with its function.",
      pairs: [
        { left: "Mitochondria", right: "Produces ATP" },
        { left: "Ribosome", right: "Builds proteins" },
        { left: "Nucleus", right: "Stores DNA" },
      ],
    });

    expect(question?.type).toBe("match");
    expect(question?.options).toHaveLength(3);
    expect(question?.options).toEqual(
      expect.arrayContaining(["Produces ATP", "Builds proteins", "Stores DNA"]),
    );

    const pairs = JSON.parse(question?.correctAnswer ?? "[]") as { left: string; right: string }[];
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toEqual({ left: "Mitochondria", right: "Produces ATP" });
  });

  it("rejects a match question with fewer than two pairs", () => {
    expect(
      normalizeQuizQuestion({
        type: "match",
        prompt: "Match the term.",
        pairs: [{ left: "Mitochondria", right: "Produces ATP" }],
      }),
    ).toBeNull();
  });

  it("no longer supports fill-in-the-blank questions", () => {
    expect(QUIZ_QUESTION_TYPES).not.toContain("fillblank");

    const question = normalizeQuizQuestion({
      type: "fillblank",
      prompt: "Water moves across a membrane by ______.",
      options: ["osmosis", "diffusion"],
      correctAnswer: "osmosis",
    });

    expect(question?.type).not.toBe("fillblank");
    expect(question?.options).toEqual([]);
  });

  it("keeps long, application and problem marking guides", () => {
    for (const type of ["long", "application", "problem"] as const) {
      const question = normalizeQuizQuestion({
        type,
        prompt: `Explain this ${type} question.`,
        correctAnswer: "A full model answer that earns all the marks.",
      });
      expect(question?.type).toBe(type);
      expect(question?.options).toEqual([]);
    }
  });
});

describe("normalizeQuizQuestions", () => {
  it("drops invalid and duplicate questions", () => {
    const questions = normalizeQuizQuestions([
      {
        type: "mcq",
        prompt: "Which phase comes after metaphase?",
        options: ["Anaphase", "Prophase", "Telophase", "Interphase"],
        correctAnswer: "Anaphase",
      },
      {
        type: "mcq",
        prompt: "Which phase comes after metaphase?",
        options: ["Anaphase", "Prophase", "Telophase", "Interphase"],
        correctAnswer: "Anaphase",
      },
      {
        type: "mcq",
        prompt: "Broken question",
        options: ["Only one", "Only two"],
        correctAnswer: "Only one",
      },
    ]);

    expect(questions).toHaveLength(1);
  });
});

describe("mcqOptionProblem", () => {
  it("reports missing options", () => {
    expect(mcqOptionProblem(["A", "B", "C"], "A")).toMatch(/at least 4/i);
  });

  it("reports duplicate options", () => {
    expect(mcqOptionProblem(["A", "A", "B", "C"], "A")).toMatch(/duplicate/i);
  });

  it("reports an unselected correct answer", () => {
    expect(mcqOptionProblem(["A", "B", "C", "D"], "E")).toMatch(/correct option/i);
  });

  it("accepts a valid question", () => {
    expect(mcqOptionProblem(["A", "B", "C", "D"], "C")).toBeNull();
  });
});

describe("matchPairProblem", () => {
  it("requires at least two complete pairs", () => {
    expect(matchPairProblem([{ left: "A", right: "1" }])).toMatch(/at least 2/i);
  });

  it("rejects duplicate left items", () => {
    expect(
      matchPairProblem([
        { left: "A", right: "1" },
        { left: "A", right: "2" },
      ]),
    ).toMatch(/left item/i);
  });

  it("rejects duplicate right options", () => {
    expect(
      matchPairProblem([
        { left: "A", right: "1" },
        { left: "B", right: "1" },
      ]),
    ).toMatch(/right option/i);
  });

  it("accepts unique complete pairs", () => {
    expect(
      matchPairProblem([
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ]),
    ).toBeNull();
  });
});

describe("questionTypeLabel", () => {
  it("labels every answer type", () => {
    expect(questionTypeLabel("mcq")).toBe("Multiple choice");
    expect(questionTypeLabel("match")).toBe("Match the following");
    expect(questionTypeLabel("fillblank")).toBe("Question");
    expect(questionTypeLabel("application")).toBe("Application-based");
    expect(questionTypeLabel("problem")).toBe("Problem-solving");
  });
});
