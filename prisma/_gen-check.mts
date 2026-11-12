import { localCards, localQuiz } from "../src/lib/ai/study-tools.ts";
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

process.env.GEMINI_API_KEY = "";

const bytes = new Uint8Array(
  await readFile("C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf"),
);
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const source = (Array.isArray(result.text) ? result.text : [result.text])
  .map((text, index) => `\n[[page:${index + 1}]]\n${text}`)
  .join("\n\n")
  .slice(0, 200_000);

console.log("======= QUIZ (12 questions, mcq/tf/match/short/long) =======");
const questions = localQuiz(source, 12, "miniproject", {
  difficulty: "medium",
  questionTypes: ["mcq", "truefalse", "match", "short", "long"],
  formats: ["definition", "factual", "conceptual"],
});
for (const question of questions) {
  console.log(`\n[${question.type}] ${question.topicLabel} — ref ${question.sourceRef}`);
  console.log("  Q:", question.prompt.replace(/\n/g, " ").slice(0, 110));
  console.log("  A:", question.correctAnswer.replace(/\n/g, " ").slice(0, 110));
  console.log("  E:", question.explanation.slice(0, 100));
}

console.log("\n======= CARDS (12) =======");
const cards = localCards(source, 12, "miniproject");
for (const card of cards) {
  console.log(`- ${card.front.replace(/\n/g, " ").slice(0, 90)} | ${card.back.slice(0, 70)} | ${card.topicLabel.slice(0, 30)} | ${card.sourceRef}`);
}

// distribution check
const chaptersTouched = new Set(questions.map((q) => q.topicLabel));
console.log("\nquiz topicLabels:", chaptersTouched.size);
