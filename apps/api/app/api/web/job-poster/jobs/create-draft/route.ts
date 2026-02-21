import { NextResponse } from "next/server";

export async function POST() {
  // Deprecated: replaced by /api/job-draft.
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}
