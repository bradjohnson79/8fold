import { legacyRouteFrozen } from "@/src/lib/api/legacyFreeze";

const NEXT_ROUTE = "/api/web/v4/job-poster/messages/threads";

export async function GET() {
  return legacyRouteFrozen(NEXT_ROUTE);
}

export async function POST() {
  return legacyRouteFrozen(NEXT_ROUTE);
}

export async function PUT() {
  return legacyRouteFrozen(NEXT_ROUTE);
}

export async function PATCH() {
  return legacyRouteFrozen(NEXT_ROUTE);
}

export async function DELETE() {
  return legacyRouteFrozen(NEXT_ROUTE);
}
