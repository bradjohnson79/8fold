import { NextResponse } from "next/server";
import { toHttpError } from "../../../../../src/http/errors";
import { testNano } from "../../../../../src/ai/diagnostics/testNano";

/**
 * DEV-ONLY diagnostic endpoint.
 * Hard-verifies GPT-5 nano is callable from the API runtime.
 *
 * Returns 404 in production.
 */
export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await testNano();
    return NextResponse.json({ ok: true, model: "gpt-5-nano", result });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

