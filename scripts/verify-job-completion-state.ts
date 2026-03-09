#!/usr/bin/env npx tsx
/**
 * Step 1 & 2: Verify job lifecycle state and assignment state for dashboard completion diagnosis.
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local npx tsx scripts/verify-job-completion-state.ts
 */
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

import { db } from "../apps/api/db/drizzle";
import { jobs } from "../apps/api/db/schema/job";
import { v4JobAssignments } from "../apps/api/db/schema/v4JobAssignment";
import { eq } from "drizzle-orm";

const JOB_ID = "52d7114d-0daf-48eb-95e4-4efaa81ff6ba";

async function main() {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      job_poster_user_id: jobs.job_poster_user_id,
      contractor_user_id: jobs.contractor_user_id,
      contractor_marked_complete_at: jobs.contractor_marked_complete_at,
      poster_marked_complete_at: jobs.poster_marked_complete_at,
      completed_at: jobs.completed_at,
      completion_window_expires_at: jobs.completion_window_expires_at,
      accepted_at: jobs.accepted_at,
      updated_at: jobs.updated_at,
    })
    .from(jobs)
    .where(eq(jobs.id, JOB_ID))
    .limit(1);

  const job = rows[0];
  if (!job) {
    console.log("Job not found:", JOB_ID);
    process.exit(1);
  }

  console.log("=== STEP 1: DATABASE JOB STATE ===\n");
  console.log(JSON.stringify({
    id: job.id,
    status: job.status,
    job_poster_user_id: job.job_poster_user_id,
    contractor_user_id: job.contractor_user_id,
    contractor_marked_complete_at: job.contractor_marked_complete_at?.toISOString() ?? null,
    poster_marked_complete_at: job.poster_marked_complete_at?.toISOString() ?? null,
    completed_at: job.completed_at?.toISOString() ?? null,
    completion_window_expires_at: job.completion_window_expires_at?.toISOString() ?? null,
    accepted_at: job.accepted_at?.toISOString() ?? null,
    updated_at: job.updated_at?.toISOString() ?? null,
  }, null, 2));

  const contractorDone = job.contractor_marked_complete_at != null;
  const posterDone = job.poster_marked_complete_at != null;
  const fullyComplete = job.completed_at != null && job.status === "COMPLETED";

  console.log("\nInterpretation:");
  if (fullyComplete) {
    console.log("  Case: status=COMPLETED, both reports submitted");
  } else if (contractorDone && !posterDone) {
    console.log("  Case: contractor reported, waiting for poster report");
  } else if (!contractorDone && posterDone) {
    console.log("  Case: poster reported first (unusual)");
  } else {
    console.log("  Case: neither report submitted yet");
  }

  const assignments = await db
    .select({
      jobId: v4JobAssignments.jobId,
      contractorUserId: v4JobAssignments.contractorUserId,
      status: v4JobAssignments.status,
      assignedAt: v4JobAssignments.assignedAt,
    })
    .from(v4JobAssignments)
    .where(eq(v4JobAssignments.jobId, JOB_ID));

  console.log("\n=== STEP 2: ASSIGNMENT STATE (v4_job_assignments) ===\n");
  if (assignments.length === 0) {
    console.log("No assignment rows found. Job may not be assigned via V4 flow.");
  } else {
    console.log(JSON.stringify(assignments.map((a) => ({
      jobId: a.jobId,
      contractor_user_id: a.contractorUserId,
      status: a.status,
      assigned_at: a.assignedAt?.toISOString() ?? null,
    })), null, 2));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
