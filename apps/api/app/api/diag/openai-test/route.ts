import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

function parseJsonLoose(rawText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(rawText.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export async function GET() {
  const envKeyPresent = Boolean(String(process.env.OPEN_AI_API_KEY ?? "").trim());
  const model = "gpt-5-nano";

  console.log("[diag/openai-test] OPEN_AI_API_KEY exists:", envKeyPresent);
  console.log("[diag/openai-test] model:", model);

  if (!envKeyPresent) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPEN_AI_API_KEY missing in runtime",
        stack: null,
        envKeyPresent,
        model,
      },
      { status: 500 },
    );
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });
    const raw = await client.responses.create({
      model,
      input: 'Return JSON: {"status":"ok"}',
    });

    const text =
      typeof (raw as any)?.output_text === "string"
        ? String((raw as any).output_text)
        : Array.isArray((raw as any)?.output)
          ? (raw as any).output
              .flatMap((o: any) => o?.content ?? [])
              .map((c: any) => c?.text)
              .filter((t: any) => typeof t === "string")
              .join("\n")
          : "";

    const parsed = parseJsonLoose(text);

    const rawSafe = JSON.parse(JSON.stringify(raw));

    return NextResponse.json({
      ok: true,
      envKeyPresent,
      model,
      openAiHttpStatus: 200,
      raw: rawSafe,
      parsed,
      outputText: text,
    });
  } catch (err: any) {
    const status = Number(err?.status ?? err?.response?.status ?? 500);
    const message = String(err?.message ?? "OpenAI test failed");
    const stack = typeof err?.stack === "string" ? err.stack : null;

    console.error("[diag/openai-test] failure", {
      envKeyPresent,
      model,
      status,
      message,
      stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        stack,
        envKeyPresent,
        model,
        openAiHttpStatus: status,
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
