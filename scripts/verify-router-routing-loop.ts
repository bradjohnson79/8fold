/**
 * Router Marketplace Loop Verification Script
 *
 * Checks the full pipeline:
 *   1. v4_contractor_job_invites rows (invite creation)
 *   2. v4_notifications rows with type=NEW_JOB_INVITE (notification event)
 *   3. Jobs with routing_status=INVITES_SENT (status transition)
 *   4. Expiration reset readiness (OPEN_FOR_ROUTING + UNROUTED count)
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/verify-router-routing-loop.ts
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

type CheckResult = { label: string; pass: boolean; detail: string };

async function run(): Promise<void> {
  const results: CheckResult[] = [];

  console.log("═══════════════════════════════════════════════════");
  console.log("  Router Marketplace Loop Verification");
  console.log("═══════════════════════════════════════════════════\n");

  // ── Check 1: Invite rows ──
  const invites = await sql`
    SELECT id, job_id, contractor_user_id, route_id, status,
           created_at, expires_at
    FROM v4_contractor_job_invites
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const inviteCount = invites.length;
  const pendingInvites = invites.filter((r) => r.status === "PENDING");

  console.log(`1️⃣  Invite Rows: ${inviteCount} total, ${pendingInvites.length} PENDING`);
  if (inviteCount > 0) {
    for (const inv of invites.slice(0, 5)) {
      console.log(
        `   job=${String(inv.job_id).slice(0, 12)}… contractor=${String(inv.contractor_user_id).slice(0, 12)}… status=${inv.status} expires=${inv.expires_at}`,
      );
    }
  }
  results.push({
    label: "Invite rows exist",
    pass: inviteCount > 0,
    detail: `${inviteCount} invite(s) found`,
  });

  // ── Check 2: NEW_JOB_INVITE notifications ──
  const notifs = await sql`
    SELECT id, user_id, type, title, message, entity_id, read, created_at
    FROM v4_notifications
    WHERE type = 'NEW_JOB_INVITE'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const notifCount = notifs.length;

  console.log(`\n2️⃣  NEW_JOB_INVITE Notifications: ${notifCount}`);
  if (notifCount > 0) {
    for (const n of notifs.slice(0, 5)) {
      console.log(
        `   user=${String(n.user_id).slice(0, 12)}… entity=${String(n.entity_id).slice(0, 12)}… read=${n.read} title="${n.title}"`,
      );
    }
  }
  results.push({
    label: "NEW_JOB_INVITE notification exists",
    pass: notifCount > 0,
    detail: `${notifCount} notification(s) found`,
  });

  // ── Check 3: Cross-reference invites ↔ notifications ──
  if (inviteCount > 0 && notifCount > 0) {
    const inviteJobIds = new Set(invites.map((r) => r.job_id));
    const notifEntityIds = new Set(notifs.map((r) => r.entity_id));
    const overlap = [...inviteJobIds].filter((id) => notifEntityIds.has(id));
    const matched = overlap.length > 0;
    console.log(`\n3️⃣  Invite↔Notification Match: ${overlap.length} job(s) have both invite AND notification`);
    results.push({
      label: "Invite has matching notification",
      pass: matched,
      detail: matched ? `${overlap.length} matched` : "No matches — event may not have fired",
    });
  } else {
    console.log("\n3️⃣  Invite↔Notification Match: skipped (need both invites and notifications)");
    results.push({
      label: "Invite has matching notification",
      pass: false,
      detail: "Skipped — no invites or notifications yet",
    });
  }

  // ── Check 4: Routing status transitions ──
  const invitesSent = await sql`
    SELECT COUNT(*)::int AS cnt FROM jobs
    WHERE routing_status::text = 'INVITES_SENT'
  `;
  const invitesSentCount = Number(invitesSent[0].cnt);
  console.log(`\n4️⃣  Jobs with routing_status=INVITES_SENT: ${invitesSentCount}`);
  results.push({
    label: "routing_status=INVITES_SENT jobs exist",
    pass: invitesSentCount > 0,
    detail: `${invitesSentCount} job(s) in INVITES_SENT`,
  });

  // ── Check 5: Available jobs pool (OPEN_FOR_ROUTING + UNROUTED) ──
  const available = await sql`
    SELECT COUNT(*)::int AS cnt FROM jobs
    WHERE status::text = 'OPEN_FOR_ROUTING'
      AND routing_status::text = 'UNROUTED'
  `;
  const availableCount = Number(available[0].cnt);
  console.log(`\n5️⃣  Available Jobs Pool (OPEN_FOR_ROUTING + UNROUTED): ${availableCount}`);
  results.push({
    label: "Available jobs pool is healthy",
    pass: availableCount > 0,
    detail: `${availableCount} job(s) available`,
  });

  // ── Check 6: Expiration reset readiness ──
  // Jobs with INVITES_SENT where all invites have expired should be reset
  const staleJobs = await sql`
    SELECT j.id, j.routing_status::text AS routing_status
    FROM jobs j
    WHERE j.routing_status::text IN ('INVITES_SENT', 'ROUTED_BY_ROUTER')
      AND j.contractor_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM v4_contractor_job_invites i
        WHERE i.job_id = j.id
          AND i.status = 'PENDING'
          AND i.expires_at > NOW()
      )
  `;
  const staleCount = staleJobs.length;
  console.log(`\n6️⃣  Stale Jobs (INVITES_SENT, all invites expired, no contractor): ${staleCount}`);
  if (staleCount > 0) {
    console.log("   These would be reset to UNROUTED by expireStaleInvitesAndResetJobs()");
  }
  results.push({
    label: "No orphaned stale jobs",
    pass: staleCount === 0,
    detail: staleCount === 0 ? "Clean — no stale jobs" : `${staleCount} stale job(s) need reset`,
  });

  // ── Summary ──
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════\n");

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.label}: ${r.detail}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\n  Overall: ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  console.log("═══════════════════════════════════════════════════\n");

  if (!allPass) {
    console.log("  Note: Checks 1-4 will fail until a job is routed via the dashboard.");
    console.log("  Route a job, then re-run this script to verify the full pipeline.\n");
  }
}

run().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
