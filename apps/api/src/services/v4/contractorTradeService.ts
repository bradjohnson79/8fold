/**
 * Contractor trade skills service.
 *
 * Rules:
 * - Max 3 trades per contractor
 * - approved = yearsExperience >= 3
 * - If zero approved trades → contractorAccounts.isActive=false + status="SUSPENDED_PENDING_EXPERIENCE"
 * - If ≥1 approved trade  → contractorAccounts.isActive=true  + status="ACTIVE"
 */

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { v4ContractorTradeSkills } from "@/db/schema/v4ContractorTradeSkills";
import { v4ContractorCertifications } from "@/db/schema/v4ContractorCertifications";
import { badRequest } from "@/src/services/v4/v4Errors";

export type TradeSkillInput = {
  tradeCategory: string;
  yearsExperience: number;
};

export type TradeSkillRow = {
  id: string;
  tradeCategory: string;
  yearsExperience: number;
  approved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CertificationRow = {
  id: string;
  tradeSkillId: string;
  certificationName: string;
  issuingOrganization: string | null;
  certificateImageUrl: string | null;
  certificateType: string | null;
  issuedAt: Date | null;
  verified: boolean;
  createdAt: Date;
};

export type TradeSkillWithCerts = TradeSkillRow & { certifications: CertificationRow[] };

const VALID_TRADE_CATEGORIES = new Set([
  "PLUMBING", "ELECTRICAL", "HVAC", "APPLIANCE", "HANDYMAN", "PAINTING",
  "CARPENTRY", "DRYWALL", "ROOFING", "JANITORIAL_CLEANING", "LANDSCAPING",
  "FENCING", "SNOW_REMOVAL", "JUNK_REMOVAL", "MOVING", "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY", "WELDING", "JACK_OF_ALL_TRADES",
]);

function isApproved(yearsExperience: number): boolean {
  return yearsExperience >= 3;
}

export async function upsertTradeSkills(
  userId: string,
  trades: TradeSkillInput[],
): Promise<TradeSkillWithCerts[]> {
  if (trades.length > 3) {
    throw badRequest("TRADE_LIMIT_EXCEEDED", "A maximum of 3 trade skills are allowed.");
  }

  for (const t of trades) {
    if (!VALID_TRADE_CATEGORIES.has(String(t.tradeCategory).toUpperCase())) {
      throw badRequest("INVALID_TRADE_CATEGORY", `Invalid trade category: ${t.tradeCategory}`);
    }
    if (!Number.isInteger(t.yearsExperience) || t.yearsExperience < 0) {
      throw badRequest("INVALID_YEARS_EXPERIENCE", "Years of experience must be a non-negative integer.");
    }
  }

  const now = new Date();

  // Upsert each submitted trade
  for (const t of trades) {
    const tradeCategory = String(t.tradeCategory).toUpperCase() as typeof v4ContractorTradeSkills.$inferInsert["tradeCategory"];
    const approved = isApproved(t.yearsExperience);

    const existing = await db
      .select({ id: v4ContractorTradeSkills.id })
      .from(v4ContractorTradeSkills)
      .where(
        and(
          eq(v4ContractorTradeSkills.contractorUserId, userId),
          eq(v4ContractorTradeSkills.tradeCategory, tradeCategory),
        ),
      )
      .limit(1);

    if (existing[0]?.id) {
      await db
        .update(v4ContractorTradeSkills)
        .set({ yearsExperience: t.yearsExperience, approved, updatedAt: now })
        .where(eq(v4ContractorTradeSkills.id, existing[0].id));
    } else {
      await db.insert(v4ContractorTradeSkills).values({
        id: randomUUID(),
        contractorUserId: userId,
        tradeCategory,
        yearsExperience: t.yearsExperience,
        approved,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Delete any trades that were removed (not in the submitted list)
  const submittedCategories = trades.map((t) =>
    String(t.tradeCategory).toUpperCase(),
  ) as (typeof v4ContractorTradeSkills.$inferInsert["tradeCategory"])[];

  const allSkills = await db
    .select({ id: v4ContractorTradeSkills.id, tradeCategory: v4ContractorTradeSkills.tradeCategory })
    .from(v4ContractorTradeSkills)
    .where(eq(v4ContractorTradeSkills.contractorUserId, userId));

  const toDelete = allSkills.filter((s) => !submittedCategories.includes(s.tradeCategory as any));
  if (toDelete.length > 0) {
    await db
      .delete(v4ContractorTradeSkills)
      .where(
        inArray(
          v4ContractorTradeSkills.id,
          toDelete.map((s) => s.id),
        ),
      );
  }

  // Re-read final skill list
  const finalSkills = await db
    .select()
    .from(v4ContractorTradeSkills)
    .where(eq(v4ContractorTradeSkills.contractorUserId, userId));

  const approvedTrades = finalSkills.filter((s) => s.approved);
  const hasApproved = approvedTrades.length > 0;

  // Sync tradeCategories[] back to contractorProfilesV4
  const categoryList = finalSkills.map((s) => s.tradeCategory);
  await db
    .update(contractorProfilesV4)
    .set({ tradeCategories: categoryList, updatedAt: now })
    .where(eq(contractorProfilesV4.userId, userId));

  // Update contractor account status and isActive
  const primaryTrade = (approvedTrades[0]?.tradeCategory ?? finalSkills[0]?.tradeCategory ?? null) as string | null;

  await db
    .update(contractorAccounts)
    .set({
      isActive: hasApproved,
      status: hasApproved ? "ACTIVE" : "SUSPENDED_PENDING_EXPERIENCE",
      ...(primaryTrade ? { tradeCategory: primaryTrade } : {}),
    } as any)
    .where(eq(contractorAccounts.userId, userId));

  return getTradeSkillsWithCerts(userId);
}

export async function getTradeSkillsWithCerts(userId: string): Promise<TradeSkillWithCerts[]> {
  const skills = await db
    .select()
    .from(v4ContractorTradeSkills)
    .where(eq(v4ContractorTradeSkills.contractorUserId, userId));

  if (skills.length === 0) return [];

  const skillIds = skills.map((s) => s.id);
  const certs = await db
    .select()
    .from(v4ContractorCertifications)
    .where(inArray(v4ContractorCertifications.tradeSkillId, skillIds));

  return skills.map((s) => ({
    ...s,
    tradeCategory: s.tradeCategory as string,
    certifications: certs.filter((c) => c.tradeSkillId === s.id),
  }));
}

export type CertInput = {
  tradeSkillId: string;
  certificationName: string;
  issuingOrganization?: string | null;
  certificateImageUrl?: string | null;
  certificateType?: string | null;
  issuedAt?: string | null;
};

export async function upsertCertification(
  userId: string,
  input: CertInput,
): Promise<CertificationRow> {
  // Verify trade skill belongs to this contractor
  const skill = await db
    .select({ id: v4ContractorTradeSkills.id })
    .from(v4ContractorTradeSkills)
    .where(
      and(
        eq(v4ContractorTradeSkills.id, input.tradeSkillId),
        eq(v4ContractorTradeSkills.contractorUserId, userId),
      ),
    )
    .limit(1);

  if (!skill[0]) {
    throw badRequest("TRADE_SKILL_NOT_FOUND", "Trade skill not found or does not belong to you.");
  }

  const existing = await db
    .select({ id: v4ContractorCertifications.id })
    .from(v4ContractorCertifications)
    .where(eq(v4ContractorCertifications.tradeSkillId, input.tradeSkillId))
    .limit(1);

  const issuedAt = input.issuedAt ? new Date(input.issuedAt) : null;

  if (existing[0]?.id) {
    await db
      .update(v4ContractorCertifications)
      .set({
        certificationName: input.certificationName,
        issuingOrganization: input.issuingOrganization ?? null,
        certificateImageUrl: input.certificateImageUrl ?? null,
        certificateType: input.certificateType ?? null,
        issuedAt,
      })
      .where(eq(v4ContractorCertifications.id, existing[0].id));

    const rows = await db
      .select()
      .from(v4ContractorCertifications)
      .where(eq(v4ContractorCertifications.id, existing[0].id))
      .limit(1);
    return rows[0] as CertificationRow;
  }

  const id = randomUUID();
  await db.insert(v4ContractorCertifications).values({
    id,
    contractorUserId: userId,
    tradeSkillId: input.tradeSkillId,
    certificationName: input.certificationName,
    issuingOrganization: input.issuingOrganization ?? null,
    certificateImageUrl: input.certificateImageUrl ?? null,
    certificateType: input.certificateType ?? null,
    issuedAt,
    verified: false,
    createdAt: new Date(),
  });

  const rows = await db
    .select()
    .from(v4ContractorCertifications)
    .where(eq(v4ContractorCertifications.id, id))
    .limit(1);
  return rows[0] as CertificationRow;
}
