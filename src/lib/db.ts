import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * APP_DATABASE_URL (when set) takes precedence over DATABASE_URL: the Vercel
 * <-> Supabase marketplace integration manages DATABASE_URL itself and CLI
 * changes to it are ignored, so the app reads this dedicated variable first.
 */
const databaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
