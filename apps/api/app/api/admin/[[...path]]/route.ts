import { NextResponse } from "next/server";

/**
 * Catch-all for unmatched /api/admin/* routes.
 * Ensures JSON response instead of HTML 404.
 */
export async function GET() {
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 404 });
}
