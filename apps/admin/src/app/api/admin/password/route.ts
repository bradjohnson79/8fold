import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "GONE",
        message: "Legacy admin password route is retired. Manage credentials in Clerk.",
      },
    },
    { status: 410 },
  );
}
