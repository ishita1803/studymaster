import fs from "node:fs";
import { readUploadedText } from "../src/lib/files/extract";
import { localSyllabus } from "../src/lib/ai/syllabus";
import { localCards, localQuiz } from "../src/lib/ai/study-tools";

const buffer = fs.readFileSync("prisma/e2e-multichapter.pdf");

async function main() {
const form = new FormData();
form.set("file", new File([buffer], "e2e-multichapter.pdf", { type: "application/pdf" }));

const upload = await readUploadedText(form);
console.log("UPLOAD", {
  error: upload.error,
  ocr: upload.ocr,
  pages: upload.pages,
  skippedPages: upload.skippedPages,
  chars: upload.text.length,
  method: upload.method,
});
console.log("TEXT HEAD", upload.text.slice(0, 200).replace(/\n/g, " | "));

const topics = localSyllabus(upload.text, "E2E Science");
console.log("\nSYLLABUS NODES", topics.length);
for (const node of topics) {
  console.log(`- ${node.name} [${node.kind}]${node.children?.length ? ` (${node.children.length} children)` : ""}`);
  for (const child of node.children ?? []) {
    console.log(`    - ${child.name} [${child.kind}]${child.children?.length ? ` (${child.children.length})` : ""}`);
  }
}

const types = ["mcq", "truefalse", "match", "short", "long", "application", "problem"] as const;
const quiz = localQuiz(upload.text, 12, "E2E Science", {
  difficulty: "medium",
  questionTypes: [...types],
  formats: ["definition", "factual", "conceptual", "application"],
});
console.log("\nQUIZ", quiz.length, "questions; types:", [...new Set(quiz.map((q) => q.type))]);
for (const [index, q] of quiz.entries()) {
  console.log(`\n${index + 1}. [${q.type}/${q.format}] ${q.prompt}`);
  console.log(`   answer: ${q.correctAnswer.slice(0, 180)}`);
  console.log(`   explanation: ${q.explanation.slice(0, 180)}`);
  console.log(`   options: ${q.options.join(" | ").slice(0, 160)}`);
}

const cards = localCards(upload.text, 12, "E2E Science");
console.log("\nCARDS", cards.length);
for (const [index, card] of cards.entries()) {
  console.log(`\n${index + 1}. [${card.format}] ${card.front}`);
  console.log(`   ${card.back.slice(0, 180)}`);
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
