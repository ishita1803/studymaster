/**
 * ONE controlled live generation test for the content-understanding pipeline:
 * loads the real GEMINI_API_KEY (dotenv), runs makeQuiz then makeFlashcards on
 * the real 43-page "chapters done.pdf", and proves with aiGuardStats that
 *  a) the study pass is cached (flashcards reuse the quiz's understanding —
 *     counted in `sent`),
 *  b) total requests stay bounded,
 *  c) insufficient material errors locally with zero AI calls.
 * Run: npx tsx prisma/_gen-check-live.mts (budget ≈ 5 requests)
 */
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
config({ path: ".env.local" });

import { extractText, getDocumentProxy } from "unpdf";
import { makeFlashcards, makeQuiz } from "../src/lib/ai/study-tools.ts";
import {
  InsufficientMaterialError,
  studyContent,
} from "../src/lib/ai/content-study.ts";
import { aiGuardStats } from "../src/lib/ai/gemini.ts";

const bytes = new Uint8Array(
  await readFile("C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf"),
);
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const source = (Array.isArray(result.text) ? result.text : [result.text])
  .map((text, index) => `\n[[page:${index + 1}]]\n${text}`)
  .join("\n\n")
  .slice(0, 200_000);

// 0) Insufficient-material gate must refuse instantly, without AI calls.
const before = aiGuardStats();
try {
  await studyContent("Mitochondria produce energy early.");
  console.log("FAIL: short snippet passed the understanding gate");
  process.exit(2);
} catch (error) {
  console.log(
    "insufficient-material gate:",
    error instanceof InsufficientMaterialError ? "OK" : "FAIL",
    "| message:",
    (error as Error).message.slice(0, 90),
  );
}
console.log("AI calls used by the gate:", aiGuardStats().sent - before.sent);

console.log("== live QUIZ with mandatory study stage ==");
console.log("guard stats before quiz:", aiGuardStats());
const questions = await makeQuiz(source, 6, "miniproject", {
  questionTypes: ["mcq", "short", "truefalse"],
  formats: ["definition", "conceptual", "factual"],
});
for (const question of questions.slice(0, 4)) {
  console.log(
    `[${question.type}] ${question.prompt.replace(/\n/g, " ").slice(0, 100)}`,
  );
  console.log(
    `  → ${question.correctAnswer.replace(/\n/g, " ").slice(0, 90)}`,
  );
}
const afterQuiz = aiGuardStats();
console.log("guard stats after quiz:", afterQuiz);

console.log("\n== live FLASHCARDS reusing the cached study pass ==");
const cards = await makeFlashcards(source, 6, "miniproject");
for (const card of cards.slice(0, 3)) {
  console.log(
    `- ${card.front.replace(/\n/g, " ").slice(0, 100)} → ${card.back.slice(0, 80)}`,
  );
}
const final = aiGuardStats();
console.log("guard stats after cards:", final);
console.log(
  "calls used in total this run:",
  final.sent,
  "| quiz:", afterQuiz.sent,
  "| de-duped:", final.dedupedCalls,
);
