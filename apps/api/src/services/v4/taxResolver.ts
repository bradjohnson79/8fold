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

function normalizeMode(value: unknown): TaxMode {
  return String(value ?? "").trim().toUpperCase() === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
}

async function safeResolveMode(requestedMode?: TaxMode): Promise<TaxMode> {
  if (requestedMode === "INCLUSIVE" || requestedMode === "EXCLUSIVE") {
    return requestedMode;
  }

  try {
    // Select only tax_mode to avoid failures when optional columns drift between envs.
    const rows = await db
      .select({ taxMode: v4TaxSettings.taxMode })
      .from(v4TaxSettings)
      .where(eq(v4TaxSettings.id, "default"))
      .limit(1);
    return normalizeMode(rows[0]?.taxMode);
  } catch (err) {
    console.warn("[taxResolver] failed to load tax mode; defaulting to EXCLUSIVE", {
      message: err instanceof Error ? err.message : String(err),
    });
    return "EXCLUSIVE";
  }
}

async function safeResolveRate(country: string, province: string): Promise<number> {
  try {
    const regionRows = await db
      .select({ combinedRate: v4TaxRegions.combinedRate })
      .from(v4TaxRegions)
      .where(and(eq(v4TaxRegions.countryCode, country), eq(v4TaxRegions.regionCode, province), eq(v4TaxRegions.active, true)))
      .limit(1);
    // combined_rate stored as percentage (e.g. 12.000 = 12%); convert to decimal for calculations
    const ratePct = Number(regionRows[0]?.combinedRate ?? 0);
    const rate = Number.isFinite(ratePct) && ratePct > 0 ? ratePct / 100 : 0;
    return rate;
  } catch (err) {
    console.warn("[taxResolver] failed to load tax region; defaulting to 0%", {
      country,
      province,
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export async function resolve(input: TaxResolverInput): Promise<TaxResolverOutput> {
  const amountCents = Math.max(0, Math.trunc(Number(input.amountCents ?? 0)));
  const country = String(input.country ?? "").trim().toUpperCase();
  const province = String(input.province ?? "").trim().toUpperCase();

  const mode = await safeResolveMode(input.mode);
  const rate = await safeResolveRate(country, province);
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
