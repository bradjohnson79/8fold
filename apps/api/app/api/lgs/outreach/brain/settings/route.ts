import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "route_disabled",
      message: "Legacy outreach brain settings were retired in the simplicity reset.",
    },
    { status: 410 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      ok: false,
      error: "route_disabled",
      message: "Legacy outreach brain settings were retired in the simplicity reset.",
    },
    { status: 410 }
  );
}
