import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "route_disabled",
      message: "Legacy lead controls were removed in the simplicity reset.",
    },
    { status: 410 }
  );
}
