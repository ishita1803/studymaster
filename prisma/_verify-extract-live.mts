/** Live end-to-end extraction check on the exact real note content. */
import { config } from "dotenv";
config({ path: ".env.local" });

import { extractSyllabus } from "../src/lib/ai/syllabus";

const content = `PYTHON PROGRAMMING

AKTU SYLLABUS UNIT-1

Introduction to Python: Python variables, Python basic Operators, Understanding python blocks. Python Data Types, Declaring and using Numeric data types: int, float etc.`;

const extraction = await extractSyllabus(content, "miniproject");
console.log("engine:", extraction.engine);
console.log("warnings:", extraction.warnings);
console.log(
  "tree:",
  JSON.stringify(
    extraction.nodes.map((chapter) => ({
      chapter: chapter.name,
      kind: chapter.kind,
      topics: chapter.children.map((child) => ({
        name: child.name,
        kind: child.kind,
        subtopics: child.children.map((s) => s.name),
      })),
    })),
    null,
    1,
  ),
);
