import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routers } from "@/db/schema/router";
import { routerProfiles } from "@/db/schema/routerProfile";
import { isValidGeo } from "../jobs/geoValidation";
import { ensureRouterProvisioned } from "./routerProvisioning";

export type RouterSessionState = "TERMS_REQUIRED" | "PROFILE_REQUIRED" | "READY";

export type RouterSessionData = {
  hasAcceptedTerms: boolean;
  profileComplete: boolean;
  missingFields: string[];
  state: RouterSessionState;
};

/**
 * Single-source readiness snapshot for the Router dashboard.
 * No fallback heuristics; no cross-endpoint duplication.
 */
export async function getRouterSessionData(userId: string, opts?: { tx?: any }): Promise<RouterSessionData> {
  const executor = opts?.tx ?? db;

  await ensureRouterProvisioned(userId, { tx: executor });

  const [routerRows, profileRows] = await Promise.all([
    executor
      .select({
        termsAccepted: routers.termsAccepted,
      })
      .from(routers)
      .where(eq(routers.userId, userId))
      .limit(1),
    executor
      .select({
        name: routerProfiles.name,
        address: (routerProfiles as any).address,
        city: (routerProfiles as any).city,
        stateProvince: (routerProfiles as any).stateProvince,
        postalCode: (routerProfiles as any).postalCode,
        country: (routerProfiles as any).country,
        lat: routerProfiles.lat,
        lng: routerProfiles.lng,
      })
      .from(routerProfiles)
      .where(eq(routerProfiles.userId, userId))
      .limit(1),
  ]);

  const r = routerRows[0] ?? null;
  const p = profileRows[0] ?? null;

  const hasAcceptedTerms = Boolean(r?.termsAccepted);

  const missingFields: string[] = [];
  if (!String(p?.name ?? "").trim()) missingFields.push("name");
  if (!String((p as any)?.address ?? "").trim()) missingFields.push("address");
  if (!String((p as any)?.city ?? "").trim()) missingFields.push("city");
  if (!String((p as any)?.stateProvince ?? "").trim()) missingFields.push("stateProvince");
  if (!String((p as any)?.postalCode ?? "").trim()) missingFields.push("postalCode");
  if (!String((p as any)?.country ?? "").trim()) missingFields.push("country");
  if (!isValidGeo(Number(p?.lat ?? NaN), Number(p?.lng ?? NaN))) missingFields.push("mapLocation");

  const profileComplete = missingFields.length === 0;

  const state: RouterSessionState = !hasAcceptedTerms ? "TERMS_REQUIRED" : !profileComplete ? "PROFILE_REQUIRED" : "READY";

  return { hasAcceptedTerms, profileComplete, missingFields, state };
}

