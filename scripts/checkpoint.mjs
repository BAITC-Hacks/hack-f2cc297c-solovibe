import { execFileSync } from "node:child_process";
import { verify, fingerprint } from "./verify.mjs";
import { runQuiet } from "./quiet.mjs";

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const message = args.shift();
  const paths = args;
  if (!message || !paths.length) throw new Error('Usage: pnpm checkpoint "Concrete message" -- ready/path another/path');
  if (paths.some(path => path.startsWith("-") || path.includes("..") || /^[A-Za-z]:/.test(path) || path.startsWith("/"))) throw new Error("Use relative paths inside code/.");
  // Passing . is deliberate whole-package ownership; MAIN must have completed all code writers first.
  const status = execFileSync("git", ["status", "--porcelain", "--", ...paths], { encoding: "utf8" });
  if (!status.trim()) { console.log("checkpoint: no changes in the selected paths"); return; }
  const treeBefore = fingerprint();
  await verify();
  if (fingerprint() !== treeBefore) throw new Error("Files changed during verification; checkpoint stopped.");
  await runQuiet("stage", "git", ["add", "-A", "--", ...paths], { printSuccess: false });
  await runQuiet("commit", "git", ["commit", "--only", "-m", message, "--", ...paths], { printSuccess: false });
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  if (process.env.CHECKPOINT_NO_PUSH === "1") { console.log("checkpoint: committed " + sha + "; push intentionally disabled"); return; }
  try {
    await runQuiet("push", "git", ["push", "origin", "HEAD"], { printSuccess: false });
    console.log("checkpoint: committed and pushed " + sha + "; types/lint/build passed");
  } catch {
    console.error("checkpoint: commit " + sha + " is saved locally; push failed. Retry git push origin HEAD.");
    process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
