import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { runQuiet, pnpmCommand } from "./quiet.mjs";

export function fingerprint({ buildOnly = false } = {}) {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    if (buildOnly && /^(?:README\.md$|ops\/|video\/|\.github\/)/i.test(file)) continue;
    hash.update(file);
    if (existsSync(file) && statSync(file).isFile()) hash.update(readFileSync(file));
    else hash.update("<deleted>");
  }
  // Build-time public variables and dependency resolution can affect the output.
  if (existsSync(".env")) hash.update(readFileSync(".env"));
  hash.update(process.version + process.platform);
  return hash.digest("hex");
}

export async function verify({ force = false } = {}) {
  mkdirSync(".checks", { recursive: true });
  const key = fingerprint({ buildOnly: true });
  const receipt = ".checks/verified.json";
  if (!force && existsSync(receipt)) {
    const previous = JSON.parse(readFileSync(receipt, "utf8"));
    if (previous.fingerprint === key) {
      console.log("verify: OK (unchanged files; reused successful checks)");
      return key;
    }
  }
  for (const script of ["typecheck", "lint", "build"]) {
    const [cmd, args] = pnpmCommand(script);
    await runQuiet(script, cmd, args);
  }
  if (fingerprint({ buildOnly: true }) !== key) throw new Error("Build inputs changed during verification. Finish the current writing batch, then run verify again.");
  writeFileSync(receipt, JSON.stringify({ fingerprint: key, at: new Date().toISOString(), checks: ["typecheck", "lint", "build"] }) + "\n");
  console.log("verify: OK (types, lint, build; runtime behavior is checked separately)");
  return key;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/verify.mjs")) {
  verify({ force: process.argv.includes("--force") }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
