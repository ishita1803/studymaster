/** Raw credential-login timing probe against the prod server. */
const base = process.argv[2] ?? "http://localhost:3000";
const jar = new Map();
const store = (res) => {
  const get = res.headers.getSetCookie
    ? res.headers.getSetCookie.bind(res.headers)
    : () => [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  for (const header of get()) {
    const [pair] = header.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
};
const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

let start = Date.now();
const csrfRes = await fetch(`${base}/api/auth/csrf`);
store(csrfRes);
const { csrfToken } = await csrfRes.json();
console.log("csrf:", Date.now() - start, "ms");

start = Date.now();
const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
  body: new URLSearchParams({
    csrfToken,
    email: "demo@studymaster.app",
    password: "demo1234",
    callbackUrl: `${base}/dashboard`,
  }),
  redirect: "manual",
});
store(loginRes);
console.log("login POST:", loginRes.status, Date.now() - start, "ms | cookies:", [...jar.keys()].join(","));

start = Date.now();
const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie() } });
const session = await sessionRes.json();
console.log("session:", session?.user?.email ?? "NONE", Date.now() - start, "ms");

start = Date.now();
const dash = await fetch(`${base}/dashboard`, {
  headers: { Cookie: cookie() },
  redirect: "follow",
  cache: "no-store",
});
await dash.text();
console.log("GET /dashboard:", dash.status, Date.now() - start, "ms");
