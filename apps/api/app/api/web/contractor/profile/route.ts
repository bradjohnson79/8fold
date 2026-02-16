import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { contractorAccounts } from "../../../../../db/schema/contractorAccount";
import { tradeCategoryEnum } from "../../../../../db/schema/enums";
import { users } from "../../../../../db/schema/user";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";

const TradeCategorySchema = z.enum(tradeCategoryEnum.enumValues as [string, ...string[]]);

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  businessName: z.string().trim().max(160).optional().nullable(),
  businessNumber: z.string().trim().max(60).optional().nullable(),

  addressMode: z.enum(["SEARCH", "MANUAL"]).default("SEARCH"),
  addressSearchDisplayName: z.string().trim().max(240).optional().nullable(),

  address1: z.string().trim().max(200).optional().nullable(),
  address2: z.string().trim().max(200).optional().nullable(),
  apt: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(24).optional().nullable(),
  stateProvince: z.string().trim().min(2).max(2),
  country: z.enum(["US", "CA"]),

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
      db.select({ email: users.email }).from(users).where(eq(users.id, u.userId)).limit(1),
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
    const businessName =
      (b.businessName ?? "").trim() || `${b.firstName.trim()} ${b.lastName.trim()}`.trim();

    const expYears = experienceYearsFromStart(b.tradeStartYear, b.tradeStartMonth);
    const insufficient = !Number.isFinite(expYears) || expYears < 3;

    const updated = await db.transaction(async (tx) => {
      // Wide-write hygiene: split wizard writes into step-scoped updates.
      const base = await tx
        .update(contractorAccounts)
        .set({
          firstName: b.firstName,
          lastName: b.lastName,
          businessName,
          businessNumber: (b.businessNumber ?? null) as any,
          addressMode: b.addressMode,
          addressSearchDisplayName: (b.addressSearchDisplayName ?? null) as any,
          address1: (b.address1 ?? null) as any,
          address2: (b.address2 ?? null) as any,
          apt: (b.apt ?? null) as any,
          city: (b.city ?? null) as any,
          postalCode: (b.postalCode ?? null) as any,
          country: b.country as any,
          regionCode: b.stateProvince.toUpperCase(),
        })
        .where(eq(contractorAccounts.userId, u.userId))
        .returning({ userId: contractorAccounts.userId });

      if (!base.length) return base;

      await tx
        .update(contractorAccounts)
        .set({
          tradeCategory: b.tradeCategory as any,
          tradeStartYear: b.tradeStartYear,
          tradeStartMonth: b.tradeStartMonth,
          status: insufficient ? ("DENIED_INSUFFICIENT_EXPERIENCE" as any) : ("ACTIVE" as any),
          wizardCompleted: insufficient ? false : true,
        })
        .where(eq(contractorAccounts.userId, u.userId));

      return base;
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

