import { describe, expect, it } from "vitest";
import { gradeLabel, isAnswerCorrect } from "../quiz";

describe("isAnswerCorrect", () => {
  it("accepts an exact multiple-choice answer", () => {
    expect(isAnswerCorrect("mcq", "Metaphase", "Metaphase")).toBe(true);
  });

  it("is case and punctuation insensitive", () => {
    expect(isAnswerCorrect("mcq", "Tetrahedral", "  tetrahedral! ")).toBe(true);
  });

  it("rejects a different option", () => {
    expect(isAnswerCorrect("mcq", "Metaphase", "Anaphase")).toBe(false);
  });

  it("rejects blank answers", () => {
    expect(isAnswerCorrect("short", "Cytokinesis", "")).toBe(false);
    expect(isAnswerCorrect("short", "Cytokinesis", "   ")).toBe(false);
  });

  it("accepts a short answer that contains the model answer", () => {
    expect(isAnswerCorrect("short", "Cytokinesis", "cytokinesis happens after telophase")).toBe(
      true,
    );
  });

  it("accepts a short answer with enough keyword overlap", () => {
    expect(
      isAnswerCorrect("short", "electrostatic attraction between ions", "ions attract electrostatically"),
    ).toBe(false);
    expect(
      isAnswerCorrect(
        "short",
        "electrostatic attraction between oppositely charged ions",
        "electrostatic attraction between ions",
      ),
    ).toBe(true);
  });

  it("rejects a short answer with no meaningful overlap", () => {
    expect(isAnswerCorrect("short", "b squared minus four a c", "osmosis")).toBe(false);
  });

  it("does not use keyword overlap for multiple choice", () => {
    expect(isAnswerCorrect("mcq", "produce identical body cells", "body cells")).toBe(false);
  });

  it("grades a matching question only when every pair is correct", () => {
    const correct = JSON.stringify([
      { left: "Mitochondria", right: "Produces ATP" },
      { left: "Ribosome", right: "Builds proteins" },
    ]);

    expect(
      isAnswerCorrect("match", correct, JSON.stringify(["Produces ATP", "Builds proteins"])),
    ).toBe(true);
    expect(
      isAnswerCorrect("match", correct, JSON.stringify(["Builds proteins", "Produces ATP"])),
    ).toBe(false);
    expect(isAnswerCorrect("match", correct, JSON.stringify(["Produces ATP", ""]))).toBe(false);
    expect(isAnswerCorrect("match", correct, "not json")).toBe(false);
  });

  it("grades long answers by key-idea overlap", () => {
    const model =
      "Photosynthesis converts light energy into chemical energy stored in glucose inside chloroplasts.";
    expect(
      isAnswerCorrect(
        "long",
        model,
        "Photosynthesis uses light energy to make glucose in chloroplasts.",
      ),
    ).toBe(true);
    expect(isAnswerCorrect("long", model, "Plants need water.")).toBe(false);
  });
});

describe("gradeLabel", () => {
  it("maps scores to friendly labels", () => {
    expect(gradeLabel(95).label).toBe("Excellent");
    expect(gradeLabel(80).label).toBe("Strong");
    expect(gradeLabel(65).label).toBe("Getting there");
    expect(gradeLabel(20).label).toBe("Needs revision");
  });

  it("returns a tone for styling", () => {
    expect(gradeLabel(95).tone).toBe("mint");
    expect(gradeLabel(20).tone).toBe("pink");
  });
});
