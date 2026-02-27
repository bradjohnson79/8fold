import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "GONE",
        message: "Legacy admin logout is retired. Use Clerk sign-out.",
      },
    },
    { status: 410 },
  );
}
