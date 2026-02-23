/**
 * Deterministic job title humanizer.
 *
 * Usage:
 * - Dry run (default): pnpm -C apps/api tsx -r dotenv/config scripts/humanize-job-titles.ts
 * - Apply updates:     pnpm -C apps/api tsx -r dotenv/config scripts/humanize-job-titles.ts --apply
 * - Limit:             ... --take 200
 * - Only flagged:      ... --only-flagged
 */
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../db/schema/auditLog";
import { jobs } from "../db/schema/job";
import { rewriteJobTitle, titleQualityScore } from "../src/jobs/titleHumanizer";
import { assertNotProductionSeed } from "./_seedGuard";

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  return next && !next.startsWith("--") ? next : "";
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  assertNotProductionSeed("humanize-job-titles.ts");
  const apply = has("--apply");
  const onlyFlagged = has("--only-flagged");
  const take = Math.max(1, Math.min(Number(arg("--take") ?? "500") || 500, 2000));

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      tradeCategory: jobs.trade_category,
      junkHaulingItems: jobs.junk_hauling_items,
      archived: jobs.archived,
      isMock: jobs.is_mock,
      createdAt: jobs.created_at,
    })
    .from(jobs)
    .where(and(eq(jobs.is_mock, false)))
    .orderBy(desc(jobs.created_at))
    .limit(take);

  const plan = rows
    .map((j: any) => {
      const beforeQ = titleQualityScore(j.title);
      const rewrite = rewriteJobTitle({
        id: j.id,
        title: j.title,
        scope: j.scope,
        tradeCategory: j.tradeCategory,
        junkHaulingItems: j.junkHaulingItems,
      });
      return {
        id: j.id,
        archived: Boolean(j.archived),
        tradeCategory: String(j.tradeCategory),
        from: j.title,
        to: rewrite.title,
        wouldChange: rewrite.changed,
        flags: beforeQ.flags,
        scoreBefore: beforeQ.score,
        scoreAfter: rewrite.qualityAfter.score,
        reasons: rewrite.reasons,
      };
    })
    .filter((p) => (onlyFlagged ? p.flags.length > 0 : true))
    .filter((p) => p.wouldChange);

  // Summary
  const sample = plan.slice(0, 25);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        apply,
        onlyFlagged,
        scanned: rows.length,
        wouldUpdate: plan.length,
        sample,
      },
      null,
      2,
    ),
  );

  if (!apply) return;

  const now = new Date();
  const updated = await db.transaction(async (tx: any) => {
    let n = 0;
    for (const p of plan) {
      await tx.update(jobs).set({ title: p.to, updated_at: now }).where(eq(jobs.id, p.id));
      n++;
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: null,
        action: "JOB_TITLE_REWRITE_SCRIPT",
        entityType: "Job",
        entityId: p.id,
        metadata: {
          from: p.from,
          to: p.to,
          flags: p.flags,
          scoreBefore: p.scoreBefore,
          scoreAfter: p.scoreAfter,
          reasons: p.reasons,
        } as any,
      });
    }
    return n;
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, updated }, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

