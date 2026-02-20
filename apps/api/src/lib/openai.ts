import OpenAI from "openai";

if (!process.env.OPEN_AI_API_KEY) {
  // eslint-disable-next-line no-console
  console.error("❌ OPEN_AI_API_KEY missing at startup");
}

let singleton: OpenAI | null = null;

export function getOpenAiClient(): OpenAI {
  const apiKey = String(process.env.OPEN_AI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("OPEN_AI_API_KEY missing in API runtime");
  }
  if (!singleton) {
    singleton = new OpenAI({ apiKey });
  }
  return singleton;
}

export const OPENAI_APPRAISAL_MODEL = "gpt-5-nano" as const;
