import path from "node:path";
import crypto from "node:crypto";
import { assertNotProductionSeed } from "./_seedGuard";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  assertNotProductionSeed("seed-audit-job-bc-langley.ts");
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
  envOrThrow("DATABASE_URL");

  const { isDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  if (!isDevelopmentMocksEnabled()) {
    console.error("Seed scripts require DEVELOPMENT_MOCKS=true.");
    process.exit(1);
  }

  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { users } = await import("../db/schema/user");
  const { jobs } = await import("../db/schema/job");

  const posterEmail = "poster.audit@8fold.local";

  const posterRows = await db.select({ id: users.id }).from(users).where(eq(users.email, posterEmail)).limit(1);
  const posterUserId = posterRows[0]?.id ?? null;
  if (!posterUserId) throw new Error(`Missing poster user: ${posterEmail}. Run seed-audit-users.ts first.`);

  // Langley, BC coords (approx)
  const lat = 49.1044;
  const lng = -122.8011;
  const now = new Date();

  // Deterministic-ish job identity for re-runs: re-use the newest matching open job if present.
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.jobPosterUserId, posterUserId))
    .limit(20);
  const existingId = existing.map((r) => r.id).find(Boolean) ?? null;

  const jobId = existingId || crypto.randomUUID();

  // Minimal-but-routable: router/apply-routing requires contractorPayoutCents > 0 and coords present.
  const insertRow: Record<string, unknown> = {
    id: jobId,
    archived: false,
    status: "OPEN_FOR_ROUTING",
    routingStatus: "UNROUTED",
    jobSource: "REAL",
    isMock: false,

    title: "AUDIT (BC): Furniture assembly in Langley",
    scope: "Assemble one IKEA cabinet and mount to wall. Bring basic tools. Verify wall studs and level alignment.",
    region: "langley-bc",
    country: "CA",
    currency: "CAD",
    regionCode: "BC",
    regionName: "British Columbia",
    city: "Langley",
    jobType: "urban",
    tradeCategory: "FURNITURE_ASSEMBLY",

    lat,
    lng,

    // Pricing: must be non-zero for routing.
    laborTotalCents: 25000,
    materialsTotalCents: 0,
    transactionFeeCents: 2500,
    contractorPayoutCents: 20000,
    routerEarningsCents: 1500,
    brokerFeeCents: 6000,

    jobPosterUserId: posterUserId,
    postedAt: now,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Upsert via primary key.
  const updated = await db.update(jobs).set(insertRow as any).where(eq(jobs.id, jobId)).returning({ id: jobs.id });
  if (updated.length === 0) {
    await db.insert(jobs).values(insertRow as any);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, jobId, posterUserId }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

