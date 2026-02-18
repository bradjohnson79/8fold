#!/usr/bin/env npx tsx
/**
 * Verification helper for Router Dashboard Reset:
 * Exercises the router onboarding state machine purely at the DB + contract level
 * (no Clerk/browser dependency).
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(scriptDir, "..", ".env.local") });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required (apps/api/.env.local)");

  const { db } = await import("../db/drizzle");
  const { users } = await import("../db/schema/user");
  const { routers } = await import("../db/schema/router");
  const { routerProfiles } = await import("../db/schema/routerProfile");
  const { getRouterSessionData } = await import("../src/auth/routerSession");

  const runs = 5;
  const results: any[] = [];

  for (let i = 1; i <= runs; i++) {
    const userId = `verify:router:${crypto.randomUUID()}`;
    const clerkUserId = `verify:clerk:${userId}`;
    const email = `router-${i}-${crypto.randomUUID()}@example.local`;
    const now = new Date();

    await db.transaction(async (tx: any) => {
      // Clean slate for idempotency if re-run (should normally be unnecessary due to UUID userId).
      await tx.delete(routerProfiles).where(eq(routerProfiles.userId, userId));
      await tx.delete(routers).where(eq(routers.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));

      await tx.insert(users).values({
        id: userId,
        clerkUserId,
        email,
        role: "ROUTER" as any,
        status: "ACTIVE" as any,
        country: "US" as any,
        createdAt: now,
        updatedAt: now,
      } as any);

      // Step 0: provisioned but no terms accepted yet
      await tx
        .insert(routers)
        .values({ userId, homeRegionCode: "", termsAccepted: false } as any)
        .onConflictDoNothing();

      const s0 = await getRouterSessionData(userId, { tx });

      // Step 1: accept terms
      await tx.update(routers).set({ termsAccepted: true } as any).where(eq(routers.userId, userId));
      const s1 = await getRouterSessionData(userId, { tx });

      // Step 2: submit profile (instant access model; no activation gate)
      await tx
        .insert(routerProfiles)
        .values({
          id: crypto.randomUUID(),
          userId,
          name: "Verify Router",
          address: "123 Test St",
          city: "Testville",
          stateProvince: "TX",
          postalCode: "75001",
          country: "US",
          lat: 29.4241,
          lng: -98.4936,
          createdAt: now,
          updatedAt: now,
        } as any)
        .onConflictDoUpdate({
          target: routerProfiles.userId,
          set: {
            name: "Verify Router",
            address: "123 Test St",
            city: "Testville",
            stateProvince: "TX",
            postalCode: "75001",
            country: "US",
            lat: 29.4241,
            lng: -98.4936,
            updatedAt: now,
          } as any,
        });
      const s2 = await getRouterSessionData(userId, { tx });
      results.push({ run: i, userId, s0, s1, s2 });
    });
  }

  // Minimal invariant checks (throw on failure)
  for (const r of results) {
    if (r.s0.state !== "TERMS_REQUIRED") throw new Error(`run ${r.run}: expected TERMS_REQUIRED, got ${r.s0.state}`);
    if (r.s1.state !== "PROFILE_REQUIRED") throw new Error(`run ${r.run}: expected PROFILE_REQUIRED, got ${r.s1.state}`);
    if (r.s2.state !== "READY") throw new Error(`run ${r.run}: expected READY, got ${r.s2.state}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        runs,
        summary: results.map((r) => ({ run: r.run, s0: r.s0.state, s1: r.s1.state, s2: r.s2.state })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

