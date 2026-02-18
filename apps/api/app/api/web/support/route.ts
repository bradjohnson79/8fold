import { NextResponse } from "next/server";

// Compatibility shim:
// Some clients historically called `/api/web/support` directly.
// Canonical contract lives under `/api/web/support/tickets`.
import { GET as getTickets, POST as postTickets } from "./tickets/route";

function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  return await getTickets(req);
}

export async function POST(req: Request) {
  return await postTickets(req);
}

// Avoid Next.js automatic 405s on known routes.
export async function PATCH() {
  return fail(404, "Not found");
}
export async function PUT() {
  return fail(404, "Not found");
}
export async function DELETE() {
  return fail(404, "Not found");
}

