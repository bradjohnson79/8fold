import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}
