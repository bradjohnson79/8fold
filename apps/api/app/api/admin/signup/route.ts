import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "GONE",
        message: "Legacy admin signup is retired. Provision admin users via Clerk + DB role assignment.",
      },
    },
    { status: 410 },
  );
}
