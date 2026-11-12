/**
 * Creates (or resets) a throwaway e2e account for HTTP smoke-testing, prints
 * nothing sensitive. Run with: npx tsx prisma/_e2e-user.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const email = "e2e-check@studymaster.app";
const passwordHash = await bcrypt.hash("e2e-check-123456", 10);
await prisma.user.upsert({
  where: { email },
  update: { passwordHash },
  create: { name: "E2E Check", email, passwordHash },
});
console.log("e2e user ready");
await prisma.$disconnect();
