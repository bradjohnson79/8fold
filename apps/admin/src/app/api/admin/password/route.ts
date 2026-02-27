import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_LEGACY_AUTH_GONE",
        message: "Legacy admin auth route is retired. Manage credentials in Clerk.",
      },
    },
    { status: 410 },
  );
}
