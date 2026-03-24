import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apiOrigin = getValidatedApiOrigin();
    return NextResponse.json({
      ok: true,
      origin: "apps-lgs",
      api_origin: apiOrigin,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("LGS health error:", err);
    return NextResponse.json(
      {
        ok: false,
        origin: "apps-lgs",
        error: err instanceof Error ? err.message : "health_failed",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
