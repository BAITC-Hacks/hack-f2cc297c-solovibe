import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";

const args = process.argv.slice(2).filter(arg => arg !== "--");
function option(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}
async function main() {
  const promptFile = option("--prompt-file");
  const output = option("--out");
  if (!promptFile || !output) throw new Error("Usage: pnpm image --prompt-file prompt.txt --out public/artwork.png");
  if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY in .env");
  const target = resolve(output);
  const within = relative(process.cwd(), target);
  if (within.startsWith("..") || isAbsolute(within) || !target.endsWith(".png")) throw new Error("Choose a .png output inside code/.");
  if (existsSync(target)) throw new Error("Output already exists. Choose another filename.");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
      prompt: readFileSync(promptFile, "utf8"),
      size: option("--size", "1536x1024"),
      quality: option("--quality", "high"),
      output_format: "png",
      n: 1
    }),
    signal: AbortSignal.timeout(240000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error("Image API HTTP " + response.status + " (" + (result.error?.code || "request_failed") + ")");
  if (!result.data?.[0]?.b64_json) throw new Error("Image API returned no image.");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(result.data[0].b64_json, "base64"));
  console.log("image: OK " + within);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
