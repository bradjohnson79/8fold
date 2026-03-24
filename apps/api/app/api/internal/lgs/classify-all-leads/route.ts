/**
 * ONE-TIME MIGRATION — run once after deploy, then this route is inert.
 *
 * Reclassifies ALL existing contractor and job-poster leads by email format.
 * Replaces the old SMTP-based verification_status with instant classification.
 *
 * Requires: Authorization: Bearer <CRON_SECRET>
 * Method:   POST
 */
import { db } from "@/db/drizzle";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CLASSIFY_SQL = `
  CASE
    WHEN email IS NULL OR trim(email) = ''                                   THEN 'pending'
    WHEN position('@' IN lower(trim(email))) = 0                             THEN 'invalid'
    WHEN split_part(lower(trim(email)), '@', 2) = ''                         THEN 'invalid'
    WHEN split_part(lower(trim(email)), '@', 2) NOT LIKE '%.%'               THEN 'invalid'
    WHEN lower(trim(email)) LIKE '%noreply%'                                 THEN 'invalid'
    WHEN lower(trim(email)) LIKE '%no-reply%'                                THEN 'invalid'
    WHEN lower(trim(email)) LIKE '%donotreply%'                              THEN 'invalid'
    WHEN lower(trim(email)) LIKE '%do-not-reply%'                            THEN 'invalid'
    WHEN lower(trim(email)) LIKE '%unsubscribe%'                             THEN 'invalid'
    WHEN split_part(lower(trim(email)), '@', 2) IN (
           'example.com','example.org','example.net','test.com','localhost'
         )                                                                   THEN 'invalid'
    ELSE 'valid'
  END
`;

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Classify contractor leads
    const contractorResult = await db.execute(sql.raw(`
      UPDATE directory_engine.contractor_leads
      SET
        verification_status           = ${CLASSIFY_SQL},
        email_verification_status     = ${CLASSIFY_SQL},
        email_verification_checked_at = NOW(),
        email_verification_provider   = 'format-classifier',
        updated_at                    = NOW()
      WHERE archived = false
    `));

    // Classify job poster leads
    const jobResult = await db.execute(sql.raw(`
      UPDATE directory_engine.job_poster_leads
      SET
        email_verification_status     = ${CLASSIFY_SQL},
        email_verification_checked_at = NOW(),
        email_verification_provider   = 'format-classifier',
        updated_at                    = NOW()
      WHERE archived = false
    `));

    const contractorCount = (contractorResult as { rowCount?: number })?.rowCount ?? 0;
    const jobCount = (jobResult as { rowCount?: number })?.rowCount ?? 0;

    console.log("[Classify Migration] Done", { contractorCount, jobCount });

    return Response.json({
      ok: true,
      message: "Classification complete — all existing leads reclassified by email format.",
      contractor_leads_updated: contractorCount,
      job_poster_leads_updated: jobCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Classify Migration] Failed", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
