/**
 * Single source of truth for system health checks.
 * Used by both Overview dashboard and System Status page.
 */
import { sql, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { stripe } from "@/src/stripe/stripe";

export type SubStatus = {
  status: string;
  message: string;
  latencyMs?: number;
  openTickets?: number;
  gaps?: number;
};

export type SystemHealth = {
  database: SubStatus;
  stripe: SubStatus;
  support: SubStatus;
  dataCoverage: SubStatus;
  timestamp: string;
};

export async function checkStripeHealth(): Promise<SubStatus> {
  if (!stripe) {
    return { status: "OFFLINE", message: "Stripe not configured (STRIPE_SECRET_KEY missing)" };
  }
  try {
    await stripe.balance.retrieve();
    return { status: "ONLINE", message: "Stripe API reachable" };
  } catch (e: unknown) {
    const err = e as { type?: string; message?: string };
    if (err?.type === "StripeAuthenticationError") {
      return { status: "ERROR", message: "Stripe authentication failed" };
    }
    return { status: "ERROR", message: `Stripe API error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function checkDatabaseHealth(): Promise<SubStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    return { status: "ONLINE", message: `Connection OK (${latencyMs}ms)`, latencyMs };
  } catch (e) {
    return { status: "ERROR", message: `Database query failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function checkSupportHealth(): Promise<SubStatus> {
  try {
    const rows = await db
      .select({ id: v4SupportTickets.id })
      .from(v4SupportTickets)
      .where(eq(v4SupportTickets.status, "OPEN"));

    const openTickets = rows.length;
    let status: string;
    let message: string;

    if (openTickets === 0) {
      status = "IDLE";
      message = "No open tickets";
    } else if (openTickets <= 10) {
      status = "NORMAL";
      message = `${openTickets} open ticket${openTickets === 1 ? "" : "s"}`;
    } else {
      status = "BUSY";
      message = `${openTickets} open tickets awaiting review`;
    }

    return { status, message, openTickets };
  } catch {
    return { status: "ERROR", message: "Failed to query support tickets" };
  }
}

export async function checkDataCoverageHealth(): Promise<SubStatus> {
  try {
    const warnings: string[] = [];

    const [jobTotal, posterCount, contractorCount, routerCount] = await Promise.all([
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM jobs`),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "User" WHERE role = 'JOB_POSTER'`),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "Contractor"`).catch(() => null),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "User" WHERE role = 'ROUTER'`),
    ]);

    const jobs = Number((jobTotal as { rows?: { count: number }[] })?.rows?.[0]?.count ?? 0);
    const posters = Number((posterCount as { rows?: { count: number }[] })?.rows?.[0]?.count ?? 0);
    const contractors = contractorCount ? Number((contractorCount as { rows?: { count: number }[] })?.rows?.[0]?.count ?? 0) : 0;
    const routers = Number((routerCount as { rows?: { count: number }[] })?.rows?.[0]?.count ?? 0);

    if (jobs > 0 && posters === 0) warnings.push("Jobs exist but no job posters found");
    if (contractors > 0 && routers === 0) warnings.push("Contractors exist but no routers found");

    const openRoutingJobs = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM jobs WHERE status = 'OPEN_FOR_ROUTING'`,
    );
    const openRouting = Number((openRoutingJobs as { rows?: { count: number }[] })?.rows?.[0]?.count ?? 0);
    if (openRouting > 0 && routers === 0) warnings.push("Jobs open for routing but no routers exist");

    const gaps = warnings.length;
    if (gaps === 0) {
      return { status: "ONLINE", message: "No coverage gaps detected", gaps: 0 };
    }
    return { status: "ERROR", message: `${gaps} coverage gap${gaps === 1 ? "" : "s"} detected`, gaps };
  } catch {
    return { status: "ERROR", message: "Failed to check data coverage" };
  }
}

/**
 * Single source of truth for system health. Both Overview and System Status use this.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, stripeStatus, support, dataCoverage] = await Promise.all([
    checkDatabaseHealth(),
    checkStripeHealth(),
    checkSupportHealth(),
    checkDataCoverageHealth(),
  ]);

  return {
    database,
    stripe: stripeStatus,
    support,
    dataCoverage,
    timestamp: new Date().toISOString(),
  };
}
