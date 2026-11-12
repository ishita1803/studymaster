/**
 * Reproduces the live extraction request shape (single request, same schema
 * instruction + similar payload size) and prints the FULL API error body so
 * we can see exactly which quota metric is exhausted.
 */
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
const env = await readFile(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const bytes = new Uint8Array(
  await readFile("C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf"),
);
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const source = (Array.isArray(result.text) ? result.text : [result.text])
  .map((text, index) => `\n[[page:${index + 1}]]\n${text}`)
  .join("\n\n")
  .slice(0, 200_000);

// First chapter's material, roughly like the extractor sends it.
const firstChapterMark = source.indexOf("Chapter 1");
materialProbe(source.slice(firstChapterMark, firstChapterMark + 7000));

async function materialProbe(prompt) {
  const { GoogleGenAI } = await import("@google/genai");
  aiRun(prompt);
  async function aiRun(prompt) {
    const strip = (v) => (v ?? "").trim().replace(/^"(.*)"$/, "$1");
    const ai = new GoogleGenAI({ apiKey: strip(process.env.GEMINI_API_KEY) });
    try {
      const res = await ai.models.generateContent({
        model: strip(process.env.GEMINI_MODEL) || "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction:
            "You extract syllabus chapter/topics as strict JSON.",
          temperature: 0.5,
          responseMimeType: "application/json",
          maxOutputTokens: 3600,
        },
      });
      console.log("SUCCESS:", res.text?.slice(0, 120));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("FULL ERROR:", message.replace(/\s+/g, " ").slice(0, 1600));
    }
  }
}
