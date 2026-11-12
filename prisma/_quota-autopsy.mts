/** Probes the two replacement models the 404 text recommends. */
const raw = (await import("node:fs")).readFileSync(".env.local", "utf8");
const key =
  raw
    .split("\n")
    .find((line) => /^\s*GEMINI_API_KEY\s*=/.test(line))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim()
    .replace(/^"|"$/g, "") ?? "";

for (const model of ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }),
    },
  );
  const text = await res.text();
  console.log(`\n=== ${model} → HTTP ${res.status} ===`);
  console.log(text.slice(0, 220));
}
