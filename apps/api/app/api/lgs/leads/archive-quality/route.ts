import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "quality_archive_disabled",
      message: "Quality-based archiving is disabled. Archive leads manually if needed.",
    },
    { status: 410 }
  );
}
