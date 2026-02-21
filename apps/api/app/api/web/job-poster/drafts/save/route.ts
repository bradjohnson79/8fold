import { NextResponse } from "next/server";

function deprecated() {
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}

export async function POST() {
  return deprecated();
}
