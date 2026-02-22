/**
 * Production bootstrap: insert ONE minimal test job if no jobs match public filter.
 * Satisfies public filter: archived=false, status=ASSIGNED.
 * Idempotent: only inserts when no eligible jobs exist.
 * Usage: DATABASE_URL="..." pnpm seed:prod
 */
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../src/server/db/drizzle";
import { jobs } from "../db/schema/job";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ENV_PATH = path.join(SCRIPT_DIR, "..", ".env.local");
dotenv.config({ path: API_ENV_PATH });

function uuid(): string {
  return crypto.randomUUID();
}

/** Same filter as jobPublicRepo.listNewestJobs */
function publicEligibility() {
  return and(
    eq(jobs.archived, false),
    or(
      eq(jobs.status, "ASSIGNED"),
      and(eq(jobs.status, "CUSTOMER_APPROVED"), isNull(jobs.routerApprovedAt)),
    ),
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required. Set it or ensure apps/api/.env.local exists.");
    process.exit(1);
  }

  const eligibleRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(publicEligibility());
  const eligibleCount = Number(eligibleRes[0]?.count ?? 0);

  if (eligibleCount > 0) {
    console.log(`[seedProductionTestJob] Eligible jobs already exist (count=${eligibleCount}), skipping`);
    process.exit(0);
  }

  const id = uuid();

  await db.insert(jobs).values({
    id,
    title: "Production test job",
    scope: "Minimal valid job for public discovery",
    region: "vancouver-bc",
    status: "ASSIGNED",
    archived: false,
    jobType: "urban",
    serviceType: "handyman",
    country: "CA",
    countryCode: "CA",
    stateCode: "",
    regionCode: "BC",
    city: "Vancouver",
    routerEarningsCents: 0,
    brokerFeeCents: 0,
    contractorPayoutCents: 0,
    laborTotalCents: 0,
    materialsTotalCents: 0,
    transactionFeeCents: 0,
    amountCents: 0,
    routingStatus: "UNROUTED",
  });

  console.log(`[seedProductionTestJob] Inserted test job id=${id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seedProductionTestJob] Error:", err);
  process.exit(1);
});
