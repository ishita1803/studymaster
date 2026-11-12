/**
 * Local development schema generator.
 *
 * Reads prisma/schema.prisma (Postgres, used in production), swaps the
 * datasource block for SQLite, writes prisma/schema.local.prisma, then runs
 * `prisma generate` + `prisma db push` against prisma/dev.db.
 *
 * Usage:
 *   npm run db:local        → regenerate schema.local.prisma + push to dev.db
 *   npm run db:local:seed   → same, then seed dev.db (demo account)
 *
 * The committed prisma/dev.db already contains the demo dataset, so seeding
 * is only needed after a reset.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const localPath = path.join(root, "prisma", "schema.local.prisma");

const SQLITE_DATASOURCE = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

const source = readFileSync(schemaPath, "utf8");
if (!/datasource db \{[\s\S]*?provider\s*=\s*"postgresql"/.test(source)) {
  console.error("schema.prisma is not the Postgres variant — aborting to avoid clobbering.");
  process.exit(1);
}
const local = source.replace(/datasource db \{[\s\S]*?\n\}/, SQLITE_DATASOURCE);
writeFileSync(localPath, local);
console.log("wrote prisma/schema.local.prisma");

const env = {
  ...process.env,
  DATABASE_URL: "file:./dev.db",
  DIRECT_URL: "",
};
delete env.DIRECT_URL;

function run(args) {
  const res = spawnSync("npx", ["prisma", ...args, "--schema", "prisma/schema.local.prisma"], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run(["generate"]);
run(["db", "push"]);

if (process.argv[2] === "seed") {
  const res = spawnSync("npx", ["tsx", "prisma/seed.ts"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  process.exit(res.status ?? 1);
}
