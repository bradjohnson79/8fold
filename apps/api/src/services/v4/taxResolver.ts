import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4TaxRegions } from "@/db/schema/v4TaxRegion";
import { v4TaxSettings } from "@/db/schema/v4TaxSetting";

export type TaxMode = "INCLUSIVE" | "EXCLUSIVE";

export type TaxResolverInput = {
  amountCents: number;
  amountKind: "NET" | "GROSS";
  country: string;
  province: string;
  mode?: TaxMode;
};

export type TaxResolverOutput = {
  grossCents: number;
  netCents: number;
  taxCents: number;
  rate: number;
  mode: TaxMode;
};

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export async function resolve(input: TaxResolverInput): Promise<TaxResolverOutput> {
  const amountCents = Math.max(0, Math.trunc(Number(input.amountCents ?? 0)));
  const country = String(input.country ?? "").trim().toUpperCase();
  const province = String(input.province ?? "").trim().toUpperCase();

  const settingsRows = await db.select().from(v4TaxSettings).where(eq(v4TaxSettings.id, "default")).limit(1);
  const mode = (input.mode ?? String(settingsRows[0]?.taxMode ?? "EXCLUSIVE").toUpperCase()) as TaxMode;

  const regionRows = await db
    .select()
    .from(v4TaxRegions)
    .where(and(eq(v4TaxRegions.countryCode, country), eq(v4TaxRegions.regionCode, province), eq(v4TaxRegions.active, true)))
    .limit(1);
  const region = regionRows[0] ?? null;

  const rate = Number(region?.combinedRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      grossCents: amountCents,
      netCents: amountCents,
      taxCents: 0,
      rate: 0,
      mode,
    };
  }

  let netCents = amountCents;
  let grossCents = amountCents;
  let taxCents = 0;

  if (mode === "INCLUSIVE") {
    if (input.amountKind === "GROSS") {
      grossCents = amountCents;
      netCents = roundHalfUp(grossCents / (1 + rate));
      taxCents = grossCents - netCents;
    } else {
      netCents = amountCents;
      grossCents = roundHalfUp(netCents * (1 + rate));
      taxCents = grossCents - netCents;
    }
  } else {
    if (input.amountKind === "NET") {
      netCents = amountCents;
      taxCents = roundHalfUp(netCents * rate);
      grossCents = netCents + taxCents;
    } else {
      grossCents = amountCents;
      netCents = roundHalfUp(grossCents / (1 + rate));
      taxCents = grossCents - netCents;
    }
  }

  return { grossCents, netCents, taxCents, rate, mode };
}
