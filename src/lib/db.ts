import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

function configureWindowsPrismaEngine() {
  if (
    process.platform !== "win32" ||
    process.env.PRISMA_QUERY_ENGINE_LIBRARY ||
    process.env.PRISMA_QUERY_ENGINE_BINARY
  ) return;

  try {
    const nodeModule = process.getBuiltinModule("node:module");
    const fromProject = nodeModule.createRequire(join(process.cwd(), "package.json"));
    const fromPrisma = nodeModule.createRequire(fromProject.resolve("prisma/package.json"));
    const { enginesVersion } = fromPrisma("@prisma/engines") as { enginesVersion: string };
    const engine = join(dirname(fromPrisma.resolve("@prisma/engines/package.json")), "query_engine-windows.dll.node");
    // The CLI copies this library into the generated client. Loading the matching
    // source keeps Windows from locking the copy that prisma generate replaces.
    const version = Prisma.prismaVersion;
    if ("engine" in version && version.engine === enginesVersion && existsSync(engine)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
    }
  } catch (error) {
    // A runtime installation can omit the Prisma CLI and use its generated copy.
    if (!(error instanceof Error && "code" in error && error.code === "MODULE_NOT_FOUND")) throw error;
  }
}

const shared = globalThis as typeof globalThis & { inauraDb?: PrismaClient };
configureWindowsPrismaEngine();
export const db = shared.inauraDb ?? new PrismaClient({ errorFormat: "minimal" });
if (process.env.NODE_ENV !== "production") shared.inauraDb = db;
