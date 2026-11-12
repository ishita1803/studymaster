/** Reproduces extraction on the exact real note content, local engine only. */
import { localSyllabus, officialSyllabusTopics } from "../src/lib/ai/syllabus";
import { buildDocumentMap } from "../src/lib/files/document-map";

const content = `PYTHON PROGRAMMING

AKTU SYLLABUS UNIT-1

Introduction to Python: Python variables, Python basic Operators, Understanding python blocks. Python Data Types, Declaring and using Numeric data types: int, float etc.`;

console.log("=== buildDocumentMap ===");
const map = buildDocumentMap(content);
console.log(JSON.stringify(
  {
    chapters: map.chapters.map((c) => ({
      label: c.label,
      number: c.number,
      title: c.title,
      rawLen: c.raw.length,
      introBody: c.introBody?.map((b) => b.text.slice(0, 80)),
    })),
    warnings: map.warnings,
  },
  null,
  1,
));

console.log("=== localSyllabus (what produced the junk) ===");
const local = localSyllabus(content, "miniproject");
console.log(JSON.stringify(local, null, 1));

console.log("=== officialSyllabusTopics on raw content ===");
const fakeIntro = content
  .split("\n")
  .filter((line) => line.includes(":"))
  .map((text) => ({ text, page: null }));
const stmt = officialSyllabusTopics(fakeIntro, content, "miniproject");
console.log(JSON.stringify([...stmt.values()].map((n) => n.name), null, 1));
