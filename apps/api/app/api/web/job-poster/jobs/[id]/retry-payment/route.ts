import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}
