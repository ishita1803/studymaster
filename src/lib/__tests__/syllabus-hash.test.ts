import { describe, expect, it } from "vitest";
import {
  noteContentHash,
  syllabusSourceHash,
} from "@/lib/syllabus-hash";

describe("syllabus source hashing", () => {
  it("is stable for identical inputs", () => {
    const a = syllabusSourceHash([{ id: "doc1", content: "Unit 1: Python basics" }]);
    const b = syllabusSourceHash([{ id: "doc1", content: "Unit 1: Python basics" }]);
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it("changes when a document changes", () => {
    const a = syllabusSourceHash([{ id: "doc1", content: "Unit 1: Python basics" }]);
    const b = syllabusSourceHash([{ id: "doc1", content: "Unit 2: Data types" }]);
    expect(a).not.toBe(b);
  });

  it("changes when the document set changes", () => {
    const a = syllabusSourceHash([{ id: "doc1", content: "Unit 1" }]);
    const b = syllabusSourceHash([
      { id: "doc1", content: "Unit 1" },
      { id: "doc2", content: "Unit 2" },
    ]);
    expect(a).not.toBe(b);
  });

  it("ignores line-ending and surrounding whitespace churn", () => {
    const a = syllabusSourceHash([{ id: "doc1", content: "Unit 1\r\nTopics.\n\n\n" }]);
    const b = syllabusSourceHash([{ id: "doc1", content: "Unit 1\nTopics." }]);
    expect(a).toBe(b);
  });

  it("noteContentHash matches syllabusSourceHash for a single part", () => {
    expect(noteContentHash("hello world")).toBe(
      syllabusSourceHash([{ id: "note", content: "hello world" }]),
    );
    expect(noteContentHash(null)).toBe(noteContentHash(""));
  });
});
