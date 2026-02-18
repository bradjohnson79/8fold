import { db } from "@/server/db/drizzle";
import { routers } from "@/db/schema/router";

/**
 * Idempotent provisioning. Creates a router row if missing (but does not activate).
 *
 * NOTE: `routers.homeRegionCode` is non-nullable, so we initialize with "" and require later selection.
 */
export async function ensureRouterProvisioned(userId: string, opts?: { tx?: any }): Promise<void> {
  const executor = opts?.tx ?? db;
  await executor
    .insert(routers)
    .values({ userId, homeRegionCode: "" } as any)
    .onConflictDoNothing();
}

