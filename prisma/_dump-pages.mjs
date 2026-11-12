import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

const pdfPath = "C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf";
const bytes = new Uint8Array(await readFile(pdfPath));
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const pages = Array.isArray(result.text) ? result.text : [result.text];
const start = Number(process.argv[2] ?? 20);
const end = Number(process.argv[3] ?? 28);
for (let p = start; p <= end; p++) {
  console.log(`\n\n########## PAGE ${p} ##########`);
  const lines = (pages[p - 1] ?? "").split("\n");
  lines.forEach((line, i) => {
    if (line.trim()) console.log(`${String(i + 1).padStart(3)}| ${line}`);
  });
}
