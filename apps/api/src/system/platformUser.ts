import { randomUUID } from "crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "../../db/schema/user";

/**
 * Platform accounting user (non-auth). Used to record broker fees in the ledger.
 * This is not used for login, and no endpoints expose this identity.
 */
export const PLATFORM_AUTH_USER_ID = "system:platform";

type DrizzleLike = {
  select: typeof db.select;
  insert: typeof db.insert;
};

export async function getOrCreatePlatformUserId(d: DrizzleLike = db): Promise<string> {
  const existing = await d
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.clerkUserId, PLATFORM_AUTH_USER_ID), eq(users.authUserId, PLATFORM_AUTH_USER_ID)))
    .limit(1);
  const row = existing[0] ?? null;
  if (row?.id) return row.id;

  const id = randomUUID();
  const inserted = await d
    .insert(users)
    .values({
      id,
      // DB requires clerkUserId; for system users we use a reserved sentinel value.
      clerkUserId: PLATFORM_AUTH_USER_ID,
      authUserId: PLATFORM_AUTH_USER_ID,
      // Canonical role taxonomy: system identities must still use a valid role value.
      // This is not an admin operator account, but ADMIN is the least-wrong canonical bucket.
      role: "ADMIN",
      status: "ACTIVE",
      country: "US",
    } as any)
    .returning({ id: users.id });
  const created = inserted[0]?.id ?? null;
  if (!created) throw new Error("Failed to create platform user");
  return created;
}

