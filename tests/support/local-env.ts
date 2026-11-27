import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const database = new URL(process.env.DATABASE_URL ?? "file://missing");
if (
  process.env.APP_ENV !== "development" ||
  database.hostname !== "127.0.0.1" ||
  database.port !== "25422" ||
  database.pathname !== "/inaura_dev" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:25421"
) {
  throw new Error(
    "Foundation tests require the isolated loopback Compose stack and .env.example settings.",
  );
}
