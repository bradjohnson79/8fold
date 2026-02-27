import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_LEGACY_AUTH_GONE",
        message: "Legacy admin auth route is retired. Use /api/admin/v4/auth/me.",
      },
    },
    { status: 410 },
  );
}
