import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_LEGACY_AUTH_GONE",
        message: "Legacy admin auth is retired. Use /api/admin/v4/auth/bootstrap.",
      },
    },
    { status: 410 },
  );
}
