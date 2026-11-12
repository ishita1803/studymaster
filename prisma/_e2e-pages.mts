/**
 * HTTP e2e: credentials login against the local dev server, then fetch every
 * app page with the session cookie. Run: npx tsx prisma/_e2e-pages.mts
 */
const base = process.argv[2] ?? "http://localhost:3002";

const jar = new Map();
function store(res) {
  const get = res.headers.getSetCookie
    ? res.headers.getSetCookie.bind(res.headers)
    : () => [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  for (const header of get()) {
    const [pair] = header.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}
const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

const csrfRes = await fetch(`${base}/api/auth/csrf`);
store(csrfRes);
const { csrfToken } = await csrfRes.json();
console.log("csrf cookies:", [...jar.keys()].join(",") || "(none)");

const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
  body: new URLSearchParams({
    csrfToken,
    email: "e2e-check@studymaster.app",
    password: "e2e-check-123456",
    callbackUrl: `${base}/dashboard`,
  }),
  redirect: "manual",
});
store(loginRes);
console.log("login:", loginRes.status, "| cookies:", [...jar.keys()].join(",") || "(none)");

const sessionRes = await fetch(`${base}/api/auth/session`, {
  headers: { Cookie: cookie() },
});
store(sessionRes);
const session = await sessionRes.json();
console.log("session:", session?.user?.email ?? JSON.stringify(session)?.slice(0, 120));

if (session?.user?.email) {
  for (const route of [
    "/dashboard", "/roadmap", "/subjects", "/notes", "/quizzes",
    "/quizzes/new", "/flashcards", "/flashcards/study", "/focus",
    "/analytics", "/settings",
  ]) {
    const res = await fetch(`${base}${route}`, {
      headers: { Cookie: cookie() },
      redirect: "follow",
      cache: "no-store",
    });
    const startedAt = Date.now();
    const html = res.status === 200 ? await res.text() : "";
    const ms = Date.now() - startedAt;
    const broken =
      html.includes("Application error: a client-side exception") ||
      html.includes("Internal Server Error");
    console.log(
      `${route} → res.status=${await Promise.resolve(res.status)} url=${res.url.replace(base, "")} (${html.length} chars, ${ms}ms)${broken ? " ← BROKEN PAGE" : ""}`,
    );
  }
}
