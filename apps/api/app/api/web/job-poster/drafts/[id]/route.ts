import { NextResponse } from "next/server";

function deprecated() {
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}

export async function GET() {
  return deprecated();
}

export async function DELETE() {
  return deprecated();
}
