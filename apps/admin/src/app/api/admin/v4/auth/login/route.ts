import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_V4_LEGACY_AUTH_GONE",
        message: "Password login route is retired. Use /api/admin/auth/login.",
      },
    },
    { status: 410 },
  );
}
