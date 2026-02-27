import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_V4_LEGACY_AUTH_GONE",
        message: "Password logout route is retired. Use Clerk sign-out.",
      },
    },
    { status: 410 },
  );
}
