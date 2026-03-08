import { sql, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { stripe } from "@/src/stripe/stripe";

export const dynamic = "force-dynamic";

type SubStatus = {
  status: string;
  message: string;
  latencyMs?: number;
  openTickets?: number;
  gaps?: number;
};

async function checkDatabase(): Promise<SubStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    return { status: "ONLINE", message: `Connection OK (${latencyMs}ms)`, latencyMs };
  } catch (e) {
    return { status: "ERROR", message: `Database query failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function checkStripe(): Promise<SubStatus> {
  if (!stripe) {
    return { status: "OFFLINE", message: "Stripe not configured (STRIPE_SECRET_KEY missing)" };
  }
  try {
    await stripe.balance.retrieve();
    return { status: "ONLINE", message: "Stripe API reachable" };
  } catch (e: any) {
    if (e?.type === "StripeAuthenticationError") {
      return { status: "ERROR", message: "Stripe authentication failed" };
    }
    return { status: "ERROR", message: `Stripe API error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function checkSupport(): Promise<SubStatus> {
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

async function checkDataCoverage(): Promise<SubStatus> {
  try {
    const warnings: string[] = [];

    const [jobTotal, posterCount, contractorCount, routerCount] = await Promise.all([
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM jobs`),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "User" WHERE role = 'JOB_POSTER'`),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "Contractor"`).catch(() => null),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "User" WHERE role = 'ROUTER'`),
    ]);

    const jobs = Number((jobTotal as any)?.rows?.[0]?.count ?? 0);
    const posters = Number((posterCount as any)?.rows?.[0]?.count ?? 0);
    const contractors = contractorCount ? Number((contractorCount as any)?.rows?.[0]?.count ?? 0) : 0;
    const routers = Number((routerCount as any)?.rows?.[0]?.count ?? 0);

    if (jobs > 0 && posters === 0) warnings.push("Jobs exist but no job posters found");
    if (contractors > 0 && routers === 0) warnings.push("Contractors exist but no routers found");

    const openRoutingJobs = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM jobs WHERE status = 'OPEN_FOR_ROUTING'`,
    );
    const openRouting = Number((openRoutingJobs as any)?.rows?.[0]?.count ?? 0);
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

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const [database, stripeStatus, support, dataCoverage] = await Promise.all([
      checkDatabase(),
      checkStripe(),
      checkSupport(),
      checkDataCoverage(),
    ]);

    return ok({
      database,
      stripe: stripeStatus,
      support,
      dataCoverage,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[SYSTEM_STATUS]", e);
    return err(500, "ADMIN_V4_STATUS_FAILED", "Failed to retrieve system status");
  }
}
