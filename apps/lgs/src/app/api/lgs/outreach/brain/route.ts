import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "route_disabled",
      message: "The legacy outreach brain dashboard was retired in the simplicity reset.",
    },
    { status: 410 }
  );
}
