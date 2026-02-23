#!/usr/bin/env tsx
/**
 * Hygiene Phase A — Verification Harness
 *
 * 1. Runs validate:jobs-schema
 * 2. Executes SELECT-only test queries for Tier 1/2:
 *    - listNewestJobs()
 *    - Router routable jobs query (minimal)
 *    - Contractor assigned jobs query (minimal)
 *    - Admin job detail query (minimal)
 * 3. Prints PASS/FAIL per query
 * 4. Exit 1 if any fail
 *
 * Usage: pnpm -C apps/api hygiene:phaseA:check
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required. Set in apps/api/.env.local");
  process.exit(1);
}

async function runTests(): Promise<boolean> {
  const { db } = await import("../src/server/db/drizzle");
  const { listNewestJobs } = await import("../src/server/repos/jobPublicRepo.drizzle");
  const { jobs } = await import("../db/schema/job");
  const { jobPhotos } = await import("../db/schema/jobPhoto");
  const { jobPayments } = await import("../db/schema/jobPayment");
  const { jobAssignments } = await import("../db/schema/jobAssignment");
  const { contractors } = await import("../db/schema/contractor");
  const { and, eq, inArray, isNull } = await import("drizzle-orm");

  async function runValidateJobsSchema(): Promise<boolean> {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/validate_jobs_schema.ts"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DOTENV_CONFIG_PATH: ".env.local" },
      stdio: "pipe",
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      console.error("[FAIL] validate:jobs-schema");
      if (result.stderr) console.error(result.stderr.trim());
      return false;
    }
    console.log("[PASS] validate:jobs-schema");
    return true;
  }

  async function testListNewestJobs(): Promise<boolean> {
    try {
      const rows = await listNewestJobs(2);
      console.log(`[PASS] listNewestJobs (returned ${rows.length} rows)`);
      return true;
    } catch (e: any) {
      console.error(`[FAIL] listNewestJobs: ${e?.message ?? e}`);
      return false;
    }
  }

  async function testJobPhotosQuery(): Promise<boolean> {
    try {
      const jobRows = await db.select({ id: jobs.id }).from(jobs).limit(2);
      const ids = jobRows.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) {
        console.log("[PASS] job_photos query (no jobs, skip)");
        return true;
      }
      await db
        .select({ id: jobPhotos.id, job_id: jobPhotos.jobId, kind: jobPhotos.kind, url: jobPhotos.url })
        .from(jobPhotos)
        .where(inArray(jobPhotos.jobId, ids))
        .limit(10);
      console.log("[PASS] job_photos query");
      return true;
    } catch (e: any) {
      console.error(`[FAIL] job_photos query: ${e?.message ?? e}`);
      return false;
    }
  }

  async function testRouterRoutableQuery(): Promise<boolean> {
    try {
      await db
        .select({
          id: jobs.id,
          status: jobs.status,
          title: jobs.title,
        })
        .from(jobs)
        .innerJoin(jobPayments, eq(jobPayments.jobId, jobs.id))
        .where(
          and(
            eq(jobs.archived, false),
            eq(jobs.status, "OPEN_FOR_ROUTING"),
            eq(jobs.routing_status, "UNROUTED"),
            isNull(jobs.claimed_by_user_id),
            eq(jobs.is_mock, false),
            eq(jobPayments.status, "CAPTURED"),
          ),
        )
        .limit(1);
      console.log("[PASS] router routable jobs query");
      return true;
    } catch (e: any) {
      console.error(`[FAIL] router routable jobs query: ${e?.message ?? e}`);
      return false;
    }
  }

  async function testContractorAssignedQuery(): Promise<boolean> {
    try {
      await db
        .select({
          jobId: jobAssignments.jobId,
          job_id: jobs.id,
          job_title: jobs.title,
        })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
        .innerJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
        .limit(1);
      console.log("[PASS] contractor assigned jobs query");
      return true;
    } catch (e: any) {
      console.error(`[FAIL] contractor assigned jobs query: ${e?.message ?? e}`);
      return false;
    }
  }

  async function testAdminJobDetailQuery(): Promise<boolean> {
    try {
      const first = await db.select({ id: jobs.id }).from(jobs).limit(1);
      const id = first[0]?.id ?? "non-existent-id";
      // Select only Phase A–used columns (avoids stripeAccountId/stripePayoutsEnabled if missing in DB)
      await db
        .select({
          job_id: jobs.id,
          job_title: jobs.title,
          assignment_id: jobAssignments.id,
          contractor_id: contractors.id,
          contractor_businessName: contractors.businessName,
          contractor_trade: contractors.trade,
          contractor_regionCode: contractors.regionCode,
          contractor_email: contractors.email,
          contractor_phone: contractors.phone,
        })
        .from(jobs)
        .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
        .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
        .where(eq(jobs.id, id))
        .limit(1);
      console.log("[PASS] admin job detail query");
      return true;
    } catch (e: any) {
      console.error(`[FAIL] admin job detail query: ${e?.message ?? e}`);
      return false;
    }
  }

  const validateOk = await runValidateJobsSchema();
  if (!validateOk) {
    return false;
  }

  const results = await Promise.all([
    testListNewestJobs(),
    testJobPhotosQuery(),
    testRouterRoutableQuery(),
    testContractorAssignedQuery(),
    testAdminJobDetailQuery(),
  ]);

  return results.every(Boolean);
}

async function main(): Promise<void> {
  const ok = await runTests();
  if (!ok) {
    process.exit(1);
  }
  console.log("\nPhase A check: all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
