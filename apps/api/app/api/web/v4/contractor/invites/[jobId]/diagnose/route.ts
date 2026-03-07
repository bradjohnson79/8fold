import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";

/**
 * Temporary diagnostic endpoint — returns JSON describing the exact
 * state of an invite + job so we can see why the accept flow 500s.
 *
 * GET /api/web/v4/contractor/invites/{inviteId}/diagnose
 *
 * DELETE THIS FILE after the 500 is resolved.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const steps: Record<string, unknown> = {};

  try {
    steps["1_auth_start"] = true;
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) {
      steps["1_auth_result"] = "returned Response (not ok)";
      return NextResponse.json({ steps }, { status: 200 });
    }
    const userId = ctx.internalUser.id;
    steps["1_auth_ok"] = { userId };

    const resolved = await params;
    const inviteId = resolved.jobId;
    steps["2_inviteId"] = inviteId;

    const inviteRows = await db.execute(sql`
      SELECT id, job_id, contractor_user_id, status, expires_at,
             expires_at > now() AS still_valid
      FROM v4_contractor_job_invites
      WHERE id = ${inviteId}
      LIMIT 1
    `);
    const invite = (inviteRows as any).rows?.[0] ?? (inviteRows as any)[0] ?? null;
    steps["3_invite"] = invite ?? "NOT_FOUND";

    if (!invite) {
      return NextResponse.json({ steps }, { status: 200 });
    }

    const jobRows = await db.execute(sql`
      SELECT id, status, routing_status, job_poster_user_id,
             claimed_by_user_id, contractor_user_id, cancel_request_pending,
             accepted_at
      FROM jobs
      WHERE id = ${invite.job_id}
      LIMIT 1
    `);
    const job = (jobRows as any).rows?.[0] ?? (jobRows as any)[0] ?? null;
    steps["4_job"] = job ?? "NOT_FOUND";

    const assignmentRows = await db.execute(sql`
      SELECT id, contractor_user_id, status, assigned_at
      FROM v4_job_assignments
      WHERE job_id = ${invite.job_id}
      LIMIT 2
    `);
    const assignments = (assignmentRows as any).rows ?? assignmentRows ?? [];
    steps["5_existing_assignments"] = assignments;

    const threadRows = await db.execute(sql`
      SELECT id, job_poster_user_id, contractor_user_id, status
      FROM v4_message_threads
      WHERE job_id = ${invite.job_id}
      LIMIT 2
    `);
    const threads = (threadRows as any).rows ?? threadRows ?? [];
    steps["6_existing_threads"] = threads;

    const indexCheck = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'v4_message_threads'
        AND indexname = 'v4_message_threads_job_participants_uniq'
    `);
    const idx = (indexCheck as any).rows ?? indexCheck ?? [];
    steps["7_thread_unique_index"] = idx.length > 0 ? "EXISTS" : "MISSING";

    const dedupeColCheck = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'v4_notifications'
        AND column_name = 'dedupe_key'
    `);
    const dedupeCol = (dedupeColCheck as any).rows ?? dedupeColCheck ?? [];
    steps["8_dedupe_key_column"] = dedupeCol.length > 0 ? "EXISTS" : "MISSING";

    const assignIndexCheck = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'v4_job_assignments'
        AND indexname = 'v4_job_assignments_job_contractor_uniq'
    `);
    const assignIdx = (assignIndexCheck as any).rows ?? assignIndexCheck ?? [];
    steps["9_assignment_unique_index"] = assignIdx.length > 0 ? "EXISTS" : "MISSING";

    const jobColCheck = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name IN (
          'accepted_at', 'routing_started_at', 'routing_expires_at',
          'poster_accept_expires_at', 'first_routed_at',
          'routing_status', 'contractor_user_id'
        )
      ORDER BY column_name
    `);
    const jobCols = ((jobColCheck as any).rows ?? jobColCheck ?? []).map((r: any) => r.column_name);
    const requiredCols = [
      "accepted_at", "routing_started_at", "routing_expires_at",
      "poster_accept_expires_at", "routing_status", "contractor_user_id",
    ];
    const missingJobCols = requiredCols.filter((c) => !jobCols.includes(c));
    steps["10_jobs_columns"] = {
      found: jobCols,
      missing: missingJobCols.length > 0 ? missingJobCols : "NONE",
    };

    const prefTableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'v4_notification_preferences'
      ) AS exists
    `);
    const prefExists = ((prefTableCheck as any).rows ?? prefTableCheck ?? [])[0]?.exists;
    steps["11_notification_preferences_table"] = prefExists ? "EXISTS" : "MISSING";

    steps["12_diagnosis"] = {
      invite_status: invite?.status,
      invite_still_valid: invite?.still_valid,
      invite_belongs_to_user: invite?.contractor_user_id === userId,
      job_status: job?.status,
      job_routing_status: job?.routing_status,
      job_already_assigned: !!job?.contractor_user_id,
      existing_assignment_count: assignments.length,
      missing_job_columns: missingJobCols.length > 0 ? missingJobCols : "NONE",
      assignable:
        invite?.status === "PENDING" &&
        invite?.still_valid === true &&
        invite?.contractor_user_id === userId &&
        missingJobCols.length === 0 &&
        (job?.status === "INVITED" ||
          (String(job?.status).toUpperCase() === "OPEN_FOR_ROUTING" &&
            String(job?.routing_status).toUpperCase() === "INVITES_SENT")),
    };

    return NextResponse.json({ steps }, { status: 200 });
  } catch (err) {
    steps["ERROR"] = {
      message: err instanceof Error ? err.message : String(err),
      code: (err as any)?.code,
      stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
    };
    console.error("[invite-diagnose-error]", steps["ERROR"]);
    return NextResponse.json({ steps }, { status: 200 });
  }
}
