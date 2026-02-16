import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";

function getTokenFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("continue");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    // This endpoint was backed by a legacy Prisma-only table that does not exist in the Drizzle-backed schema.
    // Freeze behavior (no silent success): return 410 so the UI can fall back to normal job lookup flows.
    const token = getTokenFromUrl(req);
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
    return NextResponse.json(
      { error: "Resume links are no longer supported. Please continue from your dashboard." },
      { status: 410 }
    );
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

