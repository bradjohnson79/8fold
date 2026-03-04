import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: { message: "Router legacy endpoint removed. Use /api/web/v4/router/*" } },
    { status: 410 },
  );
}
