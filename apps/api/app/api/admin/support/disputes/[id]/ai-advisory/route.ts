import { NextResponse } from "next/server";

/**
 * Deprecated: Use POST /api/admin/disputes/[id]/ai-advisory instead.
 * This legacy endpoint returns 410 Gone.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Deprecated. Use POST /api/admin/disputes/[id]/ai-advisory" },
    {
      status: 410,
      headers: { Deprecation: "true" },
    },
  );
}
