import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { contractorAccounts } from "../../../../../db/schema/contractorAccount";
import { contractors } from "../../../../../db/schema/contractor";
import { tradeCategoryEnum } from "../../../../../db/schema/enums";
import { users } from "../../../../../db/schema/user";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { validateGeoCoords } from "../../../../../src/jobs/geoValidation";
import { sql } from "drizzle-orm";

const TradeCategorySchema = z.enum(tradeCategoryEnum.enumValues as [string, ...string[]]);

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  businessName: z.string().trim().max(160).optional().nullable(),
  businessNumber: z.string().trim().max(60).optional().nullable(),

  // Legal address (manual)
  address1: z.string().trim().min(1).max(200),
  address2: z.string().trim().max(200).optional().nullable(),
  apt: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(3).max(24),
  stateProvince: z.string().trim().min(2).max(10),
  country: z.enum(["US", "CA"]),

  // Map location (required for routing coords)
  mapDisplayName: z.string().trim().min(1).max(400),
  lat: z.number(),
  lng: z.number(),

  tradeCategory: TradeCategorySchema,
  tradeStartYear: z.number().int().min(1926).max(2026),
  tradeStartMonth: z.number().int().min(1).max(12),
});

function experienceYearsFromStart(y: number, m: number, now = new Date()): number {
  // m is 1-12
  const startMonths = y * 12 + (m - 1);
  const curMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const diffMonths = curMonths - startMonths;
  return diffMonths / 12;
}

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR" && String(u.role) !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [userRows, acctRows] = await Promise.all([
      db
        .select({ email: users.email, formattedAddress: users.formattedAddress, latitude: users.latitude, longitude: users.longitude })
        .from(users)
        .where(eq(users.id, u.userId))
        .limit(1),
      db
        .select({
          status: contractorAccounts.status,
          wizardCompleted: contractorAccounts.wizardCompleted,
          firstName: contractorAccounts.firstName,
          lastName: contractorAccounts.lastName,
          businessName: contractorAccounts.businessName,
          businessNumber: contractorAccounts.businessNumber,
          addressMode: contractorAccounts.addressMode,
          addressSearchDisplayName: contractorAccounts.addressSearchDisplayName,
          address1: contractorAccounts.address1,
          address2: contractorAccounts.address2,
          apt: contractorAccounts.apt,
          city: contractorAccounts.city,
          postalCode: contractorAccounts.postalCode,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          tradeCategory: contractorAccounts.tradeCategory,
          tradeStartYear: contractorAccounts.tradeStartYear,
          tradeStartMonth: contractorAccounts.tradeStartMonth,
        })
        .from(contractorAccounts)
        .where(eq(contractorAccounts.userId, u.userId))
        .limit(1),
    ]);
    const user = userRows[0] ?? null;
    const acct = acctRows[0] ?? null;

    if (!acct) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    return NextResponse.json({
      profile: {
        email: user?.email ?? null,
        ...acct,
        stateProvince: acct.regionCode,
        mapDisplayName: user?.formattedAddress ?? "",
        lat: user?.latitude ?? null,
        lng: user?.longitude ?? null,
      },
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR" && String(u.role) !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const b = parsed.data;
    if (b.country !== "CA" && b.country !== "US") {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_COUNTRY", message: "Country must be US or Canada." } },
        { status: 400 },
      );
    }
    try {
      validateGeoCoords(b.lat, b.lng);
    } catch {
      return NextResponse.json({ ok: false, code: "INVALID_GEO_COORDINATES" }, { status: 400 });
    }

    const businessName =
      (b.businessName ?? "").trim() || `${b.firstName.trim()} ${b.lastName.trim()}`.trim();

    const expYears = experienceYearsFromStart(b.tradeStartYear, b.tradeStartMonth);
    const insufficient = !Number.isFinite(expYears) || expYears < 3;

    const updated = await db.transaction(async (tx) => {
      const userRows = await tx.select({ email: users.email }).from(users).where(eq(users.id, u.userId)).limit(1);
      const email = String(userRows[0]?.email ?? "").trim();

      await tx
        .update(users)
        .set({
          formattedAddress: b.mapDisplayName,
          latitude: b.lat as any,
          longitude: b.lng as any,
          legalStreet: String(b.address1 ?? "").trim(),
          legalCity: b.city,
          legalProvince: b.stateProvince.toUpperCase(),
          legalPostalCode: b.postalCode,
          legalCountry: b.country as any,
          country: b.country as any,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, u.userId));

      // Best-effort: keep `Contractor` coords in sync when a Contractor row exists for this email.
      if (email) {
        await tx
          .update(contractors)
          .set({
            lat: b.lat as any,
            lng: b.lng as any,
            country: b.country as any,
            regionCode: b.stateProvince.toUpperCase(),
          } as any)
          .where(sql`lower(${contractors.email}) = lower(${email})`);
      }

      // Upsert contractor profile strictly keyed by authenticated userId.
      // This prevents phantom/duplicate rows and guarantees the admin join surface is populated.
      const set = {
        firstName: b.firstName,
        lastName: b.lastName,
        businessName,
        businessNumber: (b.businessNumber ?? null) as any,
        addressMode: "MANUAL" as any,
        addressSearchDisplayName: b.mapDisplayName as any,
        address1: (b.address1 ?? null) as any,
        address2: (b.address2 ?? null) as any,
        apt: (b.apt ?? null) as any,
        city: b.city as any,
        postalCode: b.postalCode as any,
        country: b.country as any,
        regionCode: b.stateProvince.toUpperCase(),
        tradeCategory: b.tradeCategory as any,
        tradeStartYear: b.tradeStartYear,
        tradeStartMonth: b.tradeStartMonth,
        status: insufficient ? ("DENIED_INSUFFICIENT_EXPERIENCE" as any) : ("ACTIVE" as any),
        wizardCompleted: insufficient ? false : true,
      } as const;

      return await tx
        .insert(contractorAccounts)
        .values({ userId: u.userId, ...(set as any) } as any)
        .onConflictDoUpdate({ target: contractorAccounts.userId, set: set as any })
        .returning({ userId: contractorAccounts.userId });
    });

    if (!updated.length) {
      return NextResponse.json({ error: "Contractor not provisioned" }, { status: 403 });
    }

    if (insufficient) {
      return NextResponse.json(
        {
          error: "At least 3 years of trade experience is required to join as a contractor.",
          status: "DENIED_INSUFFICIENT_EXPERIENCE",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

