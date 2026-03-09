/**
 * Shared Stripe simulation service.
 * Used by both the legacy create-account route and the unified simulate-stripe endpoint.
 * Simulation is only active when STRIPE_SIMULATION_ENABLED !== "false".
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractors } from "@/db/schema/contractor";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";

export type SimRole = "ROUTER" | "CONTRACTOR";
export type SimCurrency = "CAD" | "USD";
export type SimCountry = "CA" | "US";

export function isStripeSimulationEnabled(): boolean {
  const explicit = String(process.env.STRIPE_SIMULATION_ENABLED ?? "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return true;
}

export function expectedCurrencyForCountry(country: SimCountry): SimCurrency {
  return country === "CA" ? "CAD" : "USD";
}

function normalizeCountry(raw: string | null | undefined): SimCountry {
  const c = String(raw ?? "").trim().toUpperCase();
  return c === "CA" ? "CA" : "US";
}

export async function getUserCountryForSim(userId: string, role: SimRole): Promise<SimCountry> {
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
      .then((r: any[]) => r[0] ?? null),
    db
      .select({ stripeAccountId: contractorAccounts.stripeAccountId })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1)
      .then((r: any[]) => r[0] ?? null),
  ]);
  const fromMethod = String((method?.details as any)?.stripeAccountId ?? "").trim();
  return fromMethod || String(contractor?.stripeAccountId ?? "").trim() || null;
}

export async function persistStripeAccountForUser(args: {
  userId: string;
  stripeAccountId: string;
  expectedCurrency: SimCurrency;
  stripePayoutsEnabled?: boolean;
  stripeSimulatedApproved?: boolean;
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

    if (!method?.id) {
      await tx.insert(payoutMethods).values({
        id: randomUUID(),
        userId: args.userId,
        currency: args.expectedCurrency as any,
        provider: "STRIPE" as any,
        isActive: true,
        details: {
          stripeAccountId: args.stripeAccountId,
          ...(typeof args.stripePayoutsEnabled === "boolean" ? { stripePayoutsEnabled: args.stripePayoutsEnabled } : {}),
          ...(typeof args.stripeSimulatedApproved === "boolean" ? { stripeSimulatedApproved: args.stripeSimulatedApproved } : {}),
        } as any,
        updatedAt: now,
      });
    } else {
      await tx
        .update(payoutMethods)
        .set({
          details: {
            ...(method.details as any),
            stripeAccountId: args.stripeAccountId,
            ...(typeof args.stripePayoutsEnabled === "boolean" ? { stripePayoutsEnabled: args.stripePayoutsEnabled } : {}),
            ...(typeof args.stripeSimulatedApproved === "boolean" ? { stripeSimulatedApproved: args.stripeSimulatedApproved } : {}),
          } as any,
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

export async function markSimulatedApproval(args: {
  userId: string;
  role: SimRole;
  stripeAccountId: string;
  expectedCurrency: SimCurrency;
}) {
  await persistStripeAccountForUser({
    userId: args.userId,
    stripeAccountId: args.stripeAccountId,
    expectedCurrency: args.expectedCurrency,
    stripePayoutsEnabled: true,
    stripeSimulatedApproved: true,
  });

  if (args.role === "CONTRACTOR") {
    const now = new Date();
    const [userRow, profileRow] = await Promise.all([
      db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, args.userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ email: contractorProfilesV4.email })
        .from(contractorProfilesV4)
        .where(eq(contractorProfilesV4.userId, args.userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    const lookupEmail = String(profileRow?.email ?? userRow?.email ?? "").trim().toLowerCase();
    await Promise.all([
      db
        .update(contractorAccounts)
        .set({
          stripeAccountId: args.stripeAccountId,
          payoutMethod: "STRIPE",
          payoutStatus: "VERIFIED",
        } as any)
        .where(eq(contractorAccounts.userId, args.userId)),
      db
        .update(contractorProfilesV4)
        .set({ stripeConnected: true, updatedAt: now } as any)
        .where(eq(contractorProfilesV4.userId, args.userId)),
    ]);

    if (lookupEmail) {
      try {
        await db
          .update(contractors)
          .set({ stripeAccountId: args.stripeAccountId, stripePayoutsEnabled: true } as any)
          .where(sql`lower(${contractors.email}) = ${lookupEmail}`);
      } catch (err) {
        console.warn("[stripe-sim] contractor legacy mirror update failed; continuing", {
          userId: args.userId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
