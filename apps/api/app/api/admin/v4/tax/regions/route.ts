import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4TaxRegions } from "@/db/schema/v4TaxRegion";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { CANADIAN_PROVINCE_CODES, getProvinceByCode } from "@/src/lib/canadianProvinces";

/** Tax rate: 0–100 (stored as percentage, rounded to 3 decimal places) */
const taxRateSchema = z.number().min(0).max(100);

const CreateSchema = z.object({
  countryCode: z.literal("CA"),
  regionCode: z.string().trim().min(1).max(8).refine((c) => CANADIAN_PROVINCE_CODES.has(c.toUpperCase()), "Invalid Canadian province code"),
  regionName: z.string().trim().min(1).max(100),
  combinedRate: taxRateSchema,
  gstRate: z.number().min(0).max(100).default(0),
  pstRate: z.number().min(0).max(100).default(0),
  hstRate: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const countryCode = String(searchParams.get("countryCode") ?? "").trim().toUpperCase();

  const rows = await db
    .select()
    .from(v4TaxRegions)
    .where(countryCode ? and(eq(v4TaxRegions.countryCode, countryCode)) : undefined)
    .orderBy(asc(v4TaxRegions.countryCode), asc(v4TaxRegions.regionCode));

  return ok({ regions: rows });
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid tax region payload";
    return err(400, "ADMIN_V4_INVALID_REQUEST", msg);
  }

  const regionCode = parsed.data.regionCode.toUpperCase();
  const province = getProvinceByCode(regionCode);
  const regionName = province ? province.name : parsed.data.regionName;

  try {
    const rows = await db
      .insert(v4TaxRegions)
      .values({
        countryCode: "CA",
        regionCode,
        regionName,
        combinedRate: String(Number(parsed.data.combinedRate.toFixed(3))),
        gstRate: String(parsed.data.gstRate ?? 0),
        pstRate: String(parsed.data.pstRate ?? 0),
        hstRate: String(parsed.data.hstRate ?? 0),
        active: parsed.data.active,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return ok({ region: rows[0] ?? null }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("v4_tax_regions_country_region_unique") || msg.includes("unique")) {
      return err(409, "ADMIN_V4_TAX_REGION_DUPLICATE", "A tax region for this country and province already exists");
    }
    throw e;
  }
}
