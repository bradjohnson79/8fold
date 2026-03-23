import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "route_disabled",
      message: "Quality-based archiving was retired in the simplicity reset.",
    },
    { status: 410 }
  );
}
