import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ADMIN_V4_UNSUPPORTED",
        message: "Password management is not available from this endpoint.",
      },
    },
    { status: 410 },
  );
}
