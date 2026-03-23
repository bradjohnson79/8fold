import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "quality_archive_disabled",
    message: "Quality-based auto-archive is disabled during the simplicity reset. Use the manual archive route instead.",
  }, { status: 410 });
}
