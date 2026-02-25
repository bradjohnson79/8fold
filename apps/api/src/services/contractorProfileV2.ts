/**
 * V2 Contractor Profile Service — isolated from legacy contractor profile logic.
 * Used by the stateless contractor setup portal (/contractor/setup).
 *
 * Does NOT touch: contractors table, address/geo, legacy wizard flow.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { tradeCategoryEnum } from "@/db/schema/enums";
import { users } from "@/db/schema/user";
import { z } from "zod";

const TradeCategorySchema = z.enum(tradeCategoryEnum.enumValues as [string, ...string[]]);

export const V2ProfileBodySchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  primaryTradeCategory: TradeCategorySchema,
  secondaryTrades: z.array(TradeCategorySchema).max(10).optional().default([]),
  serviceRadiusKm: z.number().int().min(1).max(500),
  offersRegionalJobs: z.boolean().optional().default(false),
  yearsInTrade: z.number().int().min(0).max(80),
  licensed: z.boolean().optional().default(false),
  insuranceStatus: z.enum(["None", "Liability", "Full Coverage"]).optional().default("None"),
  acceptsAsapJobs: z.boolean().optional().default(false),
  typicalLeadTime: z.enum(["Same Day", "1-2 Days", "3-5 Days", "1 Week+"]).optional().default("1-2 Days"),
});

export type V2ProfileBody = z.infer<typeof V2ProfileBodySchema>;

export type V2ProfileResponse = {
  profile: {
    email: string | null;
    phone: string | null;
    contactName: string;
    businessName: string | null;
    tradeCategory: string | null;
    serviceRadiusKm: number | null;
    tradeStartYear: number | null;
    tradeStartMonth: number | null;
    stripeAccountId: string | null;
    v2Extras: {
      phone?: string;
      secondaryTrades?: string[];
      offersRegionalJobs?: boolean;
      licensed?: boolean;
      insuranceStatus?: string;
      acceptsAsapJobs?: boolean;
      typicalLeadTime?: string;
    } | null;
  } | null;
};

function yearsToStartDate(years: number, now = new Date()): { year: number; month: number } {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - years);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export async function getV2Profile(userId: string): Promise<V2ProfileResponse> {
  const [userRows, acctRows] = await Promise.all([
    db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        firstName: contractorAccounts.firstName,
        lastName: contractorAccounts.lastName,
        businessName: contractorAccounts.businessName,
        tradeCategory: contractorAccounts.tradeCategory,
        serviceRadiusKm: contractorAccounts.serviceRadiusKm,
        tradeStartYear: contractorAccounts.tradeStartYear,
        tradeStartMonth: contractorAccounts.tradeStartMonth,
        stripeAccountId: contractorAccounts.stripeAccountId,
        v2Extras: contractorAccounts.v2Extras,
      })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1),
  ]);
  const user = userRows[0] ?? null;
  const acct = acctRows[0] ?? null;

  if (!acct) {
    return {
      profile: { email: user?.email ?? null, phone: user?.phone ?? null, contactName: "", businessName: null, tradeCategory: null, serviceRadiusKm: null, tradeStartYear: null, tradeStartMonth: null, stripeAccountId: null, v2Extras: null },
    };
  }

  const contactName = [acct.firstName, acct.lastName].filter(Boolean).join(" ") || "";
  const v2Extras = acct.v2Extras as NonNullable<V2ProfileResponse["profile"]>["v2Extras"];
  const phone = String(v2Extras?.phone ?? user?.phone ?? "").trim() || null;

  return {
    profile: {
      email: user?.email ?? null,
      phone,
      contactName,
      businessName: acct.businessName,
      tradeCategory: acct.tradeCategory,
      serviceRadiusKm: acct.serviceRadiusKm,
      tradeStartYear: acct.tradeStartYear,
      tradeStartMonth: acct.tradeStartMonth,
      stripeAccountId: acct.stripeAccountId,
      v2Extras: v2Extras ?? null,
    },
  };
}

export async function upsertV2Profile(userId: string, body: V2ProfileBody): Promise<void> {
  const now = new Date();
  const { year: tradeStartYear, month: tradeStartMonth } = yearsToStartDate(body.yearsInTrade, now);

  const contactParts = body.contactName.trim().split(/\s+/);
  const firstName = contactParts[0] ?? body.contactName;
  const lastName = contactParts.slice(1).join(" ") || "";

  const v2Extras = {
    phone: body.phone,
    secondaryTrades: body.secondaryTrades ?? [],
    offersRegionalJobs: body.offersRegionalJobs ?? false,
    licensed: body.licensed ?? false,
    insuranceStatus: body.insuranceStatus ?? "None",
    acceptsAsapJobs: body.acceptsAsapJobs ?? false,
    typicalLeadTime: body.typicalLeadTime ?? "1-2 Days",
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(contractorAccounts)
      .values({
        userId,
        firstName,
        lastName,
        businessName: body.businessName,
        tradeCategory: body.primaryTradeCategory as any,
        serviceRadiusKm: body.serviceRadiusKm,
        tradeStartYear,
        tradeStartMonth,
        wizardCompleted: true,
        v2Extras: v2Extras as any,
      } as any)
      .onConflictDoUpdate({
        target: contractorAccounts.userId,
        set: {
          firstName,
          lastName,
          businessName: body.businessName,
          tradeCategory: body.primaryTradeCategory as any,
          serviceRadiusKm: body.serviceRadiusKm,
          tradeStartYear,
          tradeStartMonth,
          wizardCompleted: true,
          v2Extras: v2Extras as any,
        } as any,
      });
  });
}
