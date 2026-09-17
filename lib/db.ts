import { PrismaClient } from "@prisma/client";
import { assertProductionConfig } from "@/lib/config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

export function getPrisma(): PrismaClient | null {
  assertProductionConfig();
  if (!databaseConfigured) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
