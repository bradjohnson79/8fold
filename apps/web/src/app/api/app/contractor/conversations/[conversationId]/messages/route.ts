/**
 * @deprecated Legacy contractor API. Contractors now use /dashboard/contractor (V4).
 * Use /api/web/v4/contractor/messages/* instead.
 */
import { legacyRouteFrozen } from "@/lib/legacyFreeze";

const NEXT_ROUTE = "/api/web/v4/contractor/messages/thread/{threadId}/send";

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
