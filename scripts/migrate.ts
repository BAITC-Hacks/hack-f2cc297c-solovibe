import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
let locked = false;
try {
  await sql.unsafe("SET lock_timeout = '60s'");
  await sql.unsafe("select pg_advisory_lock(853672914)");
  locked = true;
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
} finally {
  if (locked) await sql.unsafe("select pg_advisory_unlock(853672914)");
  await sql.end();
}
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
