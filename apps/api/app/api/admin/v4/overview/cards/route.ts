import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getOverviewCardsPayload, parseOverviewCardsFilters } from "@/src/services/adminV4/overviewCardsService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const filters = parseOverviewCardsFilters(searchParams);
    const payload = await getOverviewCardsPayload(filters);
    return ok(payload);
  } catch (error) {
    console.error("[ADMIN_V4_OVERVIEW_CARDS_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_OVERVIEW_CARDS_FAILED", "Failed to load overview cards");
  }
}
