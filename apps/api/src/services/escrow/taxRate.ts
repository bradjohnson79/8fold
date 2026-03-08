import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4TaxRegions } from "@/db/schema/v4TaxRegion";

export type TaxRateLookupInput = {
  country: string;
  province: string | null | undefined;
};

const CA_PROVINCE_FALLBACK_BPS: Record<string, number> = {
  AB: 500,
  BC: 1200,
  MB: 1200,
  NB: 1500,
  NL: 1500,
  NS: 1500,
  NT: 500,
  NU: 500,
  ON: 1300,
  PE: 1500,
  QC: 1498,
  SK: 1100,
  YT: 500,
};

function normalizeCountry(country: string): string {
  return String(country ?? "").trim().toUpperCase();
}

function normalizeProvince(province: string | null | undefined): string {
  return String(province ?? "").trim().toUpperCase();
}

/** combined_rate stored as percentage (e.g. 12.000 = 12%); convert to basis points */
function toBpsFromCombinedRate(rate: unknown): number {
  const pct = Number(rate ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.max(0, Math.round((pct / 100) * 10000));
}

export async function getTaxRateBps(input: TaxRateLookupInput): Promise<number> {
  const country = normalizeCountry(input.country);
  if (country !== "CA") return 0;

  const province = normalizeProvince(input.province);
  if (!province) return 0;

  const rows = await db
    .select({ combinedRate: v4TaxRegions.combinedRate })
    .from(v4TaxRegions)
    .where(
      and(
        eq(v4TaxRegions.countryCode, "CA"),
        eq(v4TaxRegions.regionCode, province),
        eq(v4TaxRegions.active, true),
      ),
    )
    .limit(1);

  const dbRateBps = toBpsFromCombinedRate(rows[0]?.combinedRate);
  if (dbRateBps > 0) return dbRateBps;

  // TODO(escrow-v1): replace static fallback with Admin-tax managed table policies.
  return CA_PROVINCE_FALLBACK_BPS[province] ?? 0;
}
