import { GPT_MODEL } from "@8fold/shared";

export async function testNano() {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelEnv = process.env.OPENAI_MODEL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing in API runtime");
  }
  if (modelEnv && modelEnv !== "gpt-5-nano") {
    throw new Error(`OPENAI_MODEL must be gpt-5-nano (got ${modelEnv})`);
  }

  const model = GPT_MODEL;
  if (model !== "gpt-5-nano") {
    throw new Error(`GPT_MODEL must be gpt-5-nano (got ${model})`);
  }

  console.log("[ai:diagnostics] model:", model);
  console.log("[ai:diagnostics] env:", { hasKey: Boolean(apiKey), OPENAI_MODEL: modelEnv ?? null });

  const prompt = [
    "Return strict JSON only.",
    'Schema: {"reply":"..."}',
    'purpose: "env_verification"',
    'message: "Respond with the number 7 and the word OK"',
    "Output exactly: {\"reply\":\"7 OK\"}",
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 500,
    }),
  });

  const raw = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    const msg = raw?.error?.message || `OpenAI request failed (${resp.status})`;
    console.error("[ai:diagnostics] failure:", msg);
    throw new Error(msg);
  }

  const text: string =
    typeof raw?.output_text === "string"
      ? raw.output_text
      : Array.isArray(raw?.output)
        ? raw.output
            .flatMap((o: any) => o?.content ?? [])
            .map((c: any) => c?.text)
            .filter((t: any) => typeof t === "string")
            .join("\n")
        : "";

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const maybe = text.slice(start, end + 1);
      try {
        parsed = JSON.parse(maybe);
      } catch {
        console.error("[ai:diagnostics] non-JSON output:", text);
        throw new Error("AI returned non-JSON output");
      }
    } else {
      console.error("[ai:diagnostics] non-JSON output:", text);
      throw new Error("AI returned non-JSON output");
    }
  }

  if (parsed?.reply !== "7 OK") {
    throw new Error(`Unexpected reply: ${JSON.stringify(parsed)}`);
  }

  console.log("[ai:diagnostics] success:", parsed);
  return parsed as { reply: "7 OK" };
}

