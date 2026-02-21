import { NextResponse } from "next/server";

export async function POST() {
  // Deprecated: replaced by drafts-v2/current + drafts-v2/save-field.
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}
