import { sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { tableExists } from "@/src/adminBus/schemaIntrospection";

export async function getInviteStatusCounts() {
  const exists = await tableExists("v4_contractor_job_invites");
  if (!exists) {
    return {
      total: 0,
      pending: 0,
      accepted: 0,
      declined: 0,
      autoDeclined: 0,
      rejected: 0,
    };
  }

  const rows = await db.execute<{ status: string; count: number }>(sql`
    select status::text as status, count(*)::int as count
    from v4_contractor_job_invites
    group by status
  `);

  const map = new Map<string, number>();
  for (const row of (rows as any)?.rows ?? []) {
    map.set(String(row.status).toUpperCase(), Number(row.count ?? 0));
  }

  return {
    total: Array.from(map.values()).reduce((a, b) => a + b, 0),
    pending: map.get("PENDING") ?? 0,
    accepted: map.get("ACCEPTED") ?? 0,
    declined: map.get("DECLINED") ?? 0,
    autoDeclined: map.get("AUTO_DECLINED") ?? 0,
    rejected: map.get("REJECTED") ?? 0,
  };
}

export const invitesRepo = {
  getInviteStatusCounts,
};
