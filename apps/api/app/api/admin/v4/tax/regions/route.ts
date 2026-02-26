import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4TaxRegions } from "@/db/schema/v4TaxRegion";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const CreateSchema = z.object({
  countryCode: z.string().trim().length(2),
  regionCode: z.string().trim().min(1).max(8),
  regionName: z.string().trim().min(1).max(100),
  combinedRate: z.number().min(0).max(2),
  gstRate: z.number().min(0).max(2).default(0),
  pstRate: z.number().min(0).max(2).default(0),
  hstRate: z.number().min(0).max(2).default(0),
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
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid tax region payload");

  const rows = await db
    .insert(v4TaxRegions)
    .values({
      countryCode: parsed.data.countryCode.toUpperCase(),
      regionCode: parsed.data.regionCode.toUpperCase(),
      regionName: parsed.data.regionName,
      combinedRate: String(parsed.data.combinedRate),
      gstRate: String(parsed.data.gstRate ?? 0),
      pstRate: String(parsed.data.pstRate ?? 0),
      hstRate: String(parsed.data.hstRate ?? 0),
      active: parsed.data.active,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return ok({ region: rows[0] ?? null }, 201);
}
