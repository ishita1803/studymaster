import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { extractSyllabus, flattenSyllabus } from "../src/lib/ai/syllabus.ts";

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

const extraction = await extractSyllabus(source, "miniproject");
console.log("engine:", extraction.engine);
console.log("warnings:", extraction.warnings);

const chapters = extraction.nodes;
for (const chapter of chapters) {
  console.log(`\n${chapter.name} — topics=${chapter.children.length}`);
  for (const topic of chapter.children.slice(0, 20)) {
    console.log(`  - ${topic.name} (${topic.sourceRef}) subs=${topic.children.length}`);
    for (const sub of topic.children.slice(0, 4)) {
      console.log(`      · ${sub.name} (${sub.sourceRef})`);
    }
    if (topic.children.length > 4) console.log("      …");
  }
}

const rows = flattenSyllabus(chapters);
console.log("\nflatten rows:", rows.length);
