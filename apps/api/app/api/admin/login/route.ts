import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "GONE",
        message: "Legacy admin login is retired. Use Clerk admin sign-in.",
      },
    },
    { status: 410 },
  );
}
