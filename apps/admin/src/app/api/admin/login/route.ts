import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "GONE",
        message: "Legacy admin login route is retired. Use Clerk sign-in at /login.",
      },
    },
    { status: 410 },
  );
}
