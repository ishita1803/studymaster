/**
 * Live syllabus extraction check — verifies the quota guard caps the real
 * number of Gemini requests when processing the "chapters done.pdf" deck
 * (43 pages, 10 chapters). Expected: 0–2 AI calls total (extraction limit is
 * 2 per document), local parser covers the remaining chapters.
 *
 * Run: npx tsx prisma/_syllabus-check-live.mts 2>$null
 */
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
const configResult = config({ path: ".env.local" }); // real GEMINI_API_KEY lives here
if (!process.env.GEMINI_API_KEY) config(); // fallback to .env

import { extractText, getDocumentProxy } from "unpdf";
import { extractSyllabus, flattenSyllabus } from "../src/lib/ai/syllabus.ts";
import { aiEnabled, aiGuardStats, aiModel } from "../src/lib/ai/gemini.ts";

const bytes = new Uint8Array(
  await readFile("C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf"),
);
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const source = (Array.isArray(result.text) ? result.text : [result.text])
  .map((text, index) => `\n[[page:${index + 1}]]\n${text}`)
  .join("\n\n")
  .slice(0, 200_000);

console.log("aiEnabled:", aiEnabled(), "| model:", aiModel());
console.log("guard stats before:", aiGuardStats());

const start = Date.now();
let extraction: Awaited<ReturnType<typeof extractSyllabus>>;
try {
  extraction = await extractSyllabus(source, "miniproject");
} catch (error) {
  // Print the guard evidence even when the provider is unavailable/quota'd,
  // so the run always ends with a readable verdict instead of a crash.
  console.log("EXTRACTION FAILED:", error instanceof Error ? error.message : error);
  console.log("elapsed ms:", Date.now() - start);
  console.log("guard stats after (on failure):", aiGuardStats());
  process.exit(2);
}
const elapsed = Date.now() - start;

console.log("engine:", extraction.engine);
console.log("warnings:", extraction.warnings);
console.log("elapsed ms:", elapsed);
console.log("guard stats after:", aiGuardStats());

const chapters = extraction.nodes;
console.log("chapters:", chapters.length);
for (const chapter of chapters) {
  console.log(`\n${chapter.name} — topics=${chapter.children.length}`);
  for (const topic of chapter.children.slice(0, 5)) {
    console.log(`  - ${topic.name} (${topic.sourceRef})`);
  }
}

const rows = flattenSyllabus(chapters);
console.log("\nflatten rows:", rows.length);
