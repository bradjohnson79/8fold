import { NextResponse } from "next/server";

export async function POST() {
  // Deprecated for job-poster funding. Canonical flow is drafts-v2/create-payment-intent.
  return NextResponse.json(
    { success: false, code: "DEPRECATED_ENDPOINT" },
    { status: 410 },
  );
}

