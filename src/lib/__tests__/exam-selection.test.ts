import { describe, expect, it } from "vitest";
import { coveringExams, examSelectsTopic } from "../exam-selection";

const mock = { id: "mock", examTopics: [{ topicId: "cells" }] };
const final = { id: "final", examTopics: [{ topicId: "cells" }, { topicId: "genetics" }] };
const legacy = { id: "legacy", examTopics: [] };

describe("exam topic selection", () => {
  it("returns every exam that selects a shared topic, not only the nearest", () => {
    const covering = coveringExams([mock, final, legacy], "cells");
    expect(covering.map((exam) => exam.id)).toEqual(["mock", "final", "legacy"]);
  });

  it("excludes an exam that did not select the topic", () => {
    expect(coveringExams([mock, final], "genetics").map((exam) => exam.id)).toEqual([
      "final",
    ]);
  });

  it("treats a legacy exam with no rows as covering the whole subject", () => {
    expect(examSelectsTopic(legacy, "anything")).toBe(true);
  });
});
