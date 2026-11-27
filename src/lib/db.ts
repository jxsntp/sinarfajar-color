import { PrismaClient } from "@prisma/client";
const shared = globalThis as typeof globalThis & { inauraDb?: PrismaClient };
export const db =
  shared.inauraDb ?? new PrismaClient({ errorFormat: "minimal" });
if (process.env.NODE_ENV !== "production") shared.inauraDb = db;
