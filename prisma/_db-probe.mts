/** Probe Supabase connectivity N times. Run: npx tsx prisma/_db-probe.mts [count] */
import { PrismaClient } from "@prisma/client";

const PW = process.env.SB_PW ?? "";
const count = Number(process.argv[2] ?? "5");
const url = `postgresql://postgres.wyramcwptuuqwebsiyxf:${PW}@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`;

let ok = 0;
for (let i = 1; i <= count; i++) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const t0 = Date.now();
  try {
    await prisma.user.count();
    ok++;
    console.log(`try ${i}: OK in ${Date.now() - t0} ms`);
  } catch {
    console.log(`try ${i}: FAIL after ${Date.now() - t0} ms`);
  }
  await prisma.$disconnect();
}
console.log(`${ok}/${count} succeeded`);
process.exit(0);
