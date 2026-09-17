import "server-only";
import { createOpenAI } from "@ai-sdk/openai";

export function getLanguageModel() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai.responses(process.env.OPENAI_MODEL ?? "gpt-5.6-terra");
}

export const openaiOptions = {
  openai: { serviceTier: "default" as const },
};
