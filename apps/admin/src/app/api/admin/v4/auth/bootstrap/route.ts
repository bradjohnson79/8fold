import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_V4_LEGACY_AUTH_GONE",
        message: "Bootstrap route is retired. Provision admin users via Clerk + DB role assignment.",
      },
    },
    { status: 410 },
  );
}
