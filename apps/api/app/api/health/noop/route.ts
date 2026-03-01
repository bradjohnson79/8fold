import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      noop: true,
      service: "apps-api",
      origin: "apps-api",
      endpoint: "api/health/noop",
      timestamp: Date.now(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
