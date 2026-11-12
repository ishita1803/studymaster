/** ONE raw request after idle time to see if the free-tier window reset. */
import { readFile } from "node:fs/promises";
const env = await readFile(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL?.trim().replace(/^"(.*)"$/, "$1");

const { GoogleGenAI } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim().replace(/^"(.*)"$/, "$1")! });
try {
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    contents: "Reply with the single word: ok",
  });
  console.log("SUCCESS:", res.text?.trim().slice(0, 40));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = /"code":(\d+)/.exec(message)?.[1] ?? "?";
  let retry = null;
  const retryInfo = /"retryDelay":\s*"(\d+)s"/.exec(message) ?? /"(\d+)s"/.exec(message);
  if (retryInfo) retry = retryInfo[1];
  console.log(`RAW: code=${code} status=${/"status":"([A-Z_]+)"/.exec(message)?.[1] ?? "?"} retryDelay=${retry}`);
  console.log("detail:", message.replace(/\s+/g, " ").slice(0, 400));
}
