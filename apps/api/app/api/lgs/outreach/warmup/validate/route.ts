import { NextResponse } from "next/server";
import { validateWarmupSystem } from "@/src/services/lgs/warmupSystem";

export async function GET() {
  try {
    const result = await validateWarmupSystem();
    return NextResponse.json({
      ok: result.pass,
      data: result,
    }, {
      status: result.pass ? 200 : 409,
    });
  } catch (err) {
    console.error("LGS warmup validation error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
