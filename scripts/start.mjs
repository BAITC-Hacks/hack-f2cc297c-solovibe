import "dotenv/config";
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync(".next/standalone/server.js")) throw new Error("Run pnpm verify or pnpm build first.");
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: process.env.APP_PORT || "3000" }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", code => { process.exitCode = code ?? 1; });
