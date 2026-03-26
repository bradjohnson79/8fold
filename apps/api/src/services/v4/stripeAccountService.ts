import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";

export type StripeRole = "ROUTER" | "CONTRACTOR";
export type StripeCurrency = "CAD" | "USD";
export type StripeCountry = "CA" | "US";

export function expectedCurrencyForCountry(country: StripeCountry): StripeCurrency {
  return country === "CA" ? "CAD" : "USD";
}

function normalizeCountry(raw: string | null | undefined): StripeCountry {
  const country = String(raw ?? "").trim().toUpperCase();
  return country === "CA" ? "CA" : "US";
}

export async function getUserStripeCountry(userId: string, role: StripeRole): Promise<StripeCountry> {
  const [userRow, roleRow] = await Promise.all([
    db
      .select({ country: users.country })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    role === "ROUTER"
      ? db
          .select({ countryCode: routerProfilesV4.homeCountryCode })
          .from(routerProfilesV4)
          .where(eq(routerProfilesV4.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : db
          .select({ countryCode: contractorProfilesV4.countryCode })
          .from(contractorProfilesV4)
          .where(eq(contractorProfilesV4.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
  ]);

  return normalizeCountry(roleRow?.countryCode ?? userRow?.country);
}

export async function getExistingStripeAccountId(userId: string): Promise<string | null> {
  const [method, contractor] = await Promise.all([
    db
      .select({ details: payoutMethods.details })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1)
      .then((rows: any[]) => rows[0] ?? null),
    db
      .select({ stripeAccountId: contractorAccounts.stripeAccountId })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1)
      .then((rows: any[]) => rows[0] ?? null),
  ]);

  const fromMethod = String((method?.details as any)?.stripeAccountId ?? "").trim();
  return fromMethod || String(contractor?.stripeAccountId ?? "").trim() || null;
}

export async function persistStripeAccountForUser(args: {
  userId: string;
  stripeAccountId: string;
  expectedCurrency: StripeCurrency;
  stripePayoutsEnabled?: boolean;
}) {
  const now = new Date();

  await db.transaction(async (tx: any) => {
    const existingMethod = await tx
      .select({ id: payoutMethods.id, details: payoutMethods.details })
      .from(payoutMethods)
      .where(
        and(
          eq(payoutMethods.userId, args.userId),
          eq(payoutMethods.provider, "STRIPE" as any),
          eq(payoutMethods.currency, args.expectedCurrency as any),
        ),
      )
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1);

    const method = existingMethod[0] ?? null;
    const nextDetails = {
      ...((method?.details as Record<string, unknown> | null) ?? {}),
      stripeAccountId: args.stripeAccountId,
      ...(typeof args.stripePayoutsEnabled === "boolean"
        ? { stripePayoutsEnabled: args.stripePayoutsEnabled }
        : {}),
    } as any;

    if (!method?.id) {
      await tx.insert(payoutMethods).values({
        id: randomUUID(),
        userId: args.userId,
        currency: args.expectedCurrency as any,
        provider: "STRIPE" as any,
        isActive: true,
        details: nextDetails,
        updatedAt: now,
      });
    } else {
      await tx
        .update(payoutMethods)
        .set({
          details: nextDetails,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(payoutMethods.id, method.id));
    }

    await tx
      .update(contractorAccounts)
      .set({ stripeAccountId: args.stripeAccountId } as any)
      .where(eq(contractorAccounts.userId, args.userId));
  });
}
