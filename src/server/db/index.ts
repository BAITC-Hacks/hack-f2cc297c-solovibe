import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return globalDb.sql ??= postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

export function getDb() {
  return drizzle(getSql(), { schema });
}
