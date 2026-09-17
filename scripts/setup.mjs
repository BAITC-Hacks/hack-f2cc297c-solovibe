import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  const contents = readFileSync(".env.example", "utf8")
    .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${password}`)
    .replace(/^DATABASE_URL=$/m, `DATABASE_URL=postgresql://solovibe:${password}@127.0.0.1:15432/solovibe`)
    .replace(/^BETTER_AUTH_SECRET=$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`);
  writeFileSync(".env", contents, { mode: 0o600 });
  console.log("Created .env with local database and session secrets. Add external API credentials there.");
} else {
  console.log("Existing .env preserved.");
}
mkdirSync("storage", { recursive: true });
