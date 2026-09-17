import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import * as schema from "./db/schema";

function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not configured");
  return betterAuth({
    appName: "SoloVibe",
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    plugins: [nextCookies()],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return auth ??= createAuth();
}
