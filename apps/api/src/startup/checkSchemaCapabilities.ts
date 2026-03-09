/**
 * Startup schema capability check.
 * Verifies presence of columns, enums, and indexes used by the contractor
 * routing and assignment pipeline. Informational only — does not block startup.
 * Logs clear warnings if migrations are missing.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { getResolvedSchema } from "@/server/db/schemaLock";

const REQUIRED_ROUTING_STATUS_VALUES = [
  "UNROUTED",
  "ROUTED_BY_ROUTER",
  "ROUTED_BY_ADMIN",
  "INVITES_SENT",
  "INVITE_ACCEPTED",
  "INVITES_EXPIRED",
] as const;

type CheckResult = { ok: true } | { ok: false; message: string; migration?: string };

export async function checkSchemaCapabilities(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const schema = getResolvedSchema();
  const results: { name: string; result: CheckResult }[] = [];

  try {
    // 1. Notification dedupe key
    const dedupeRes = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'v4_notifications'
      AND column_name = 'dedupe_key'
    `);
    const dedupeRows = (dedupeRes as { rows?: { column_name: string }[] })?.rows ?? [];
    results.push({
      name: "v4_notifications.dedupe_key",
      result:
        dedupeRows.length > 0
          ? { ok: true }
          : {
              ok: false,
              message: "Missing column: v4_notifications.dedupe_key",
              migration: "0128_v4_notifications_dedupe_key.sql",
            },
    });

    // 2. Assignment uniqueness
    const assignRes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = ${schema}
      AND tablename = 'v4_job_assignments'
      AND indexname = 'v4_job_assignments_job_uniq'
    `);
    const assignRows = (assignRes as { rows?: { indexname: string }[] })?.rows ?? [];
    results.push({
      name: "v4_job_assignments_job_uniq",
      result:
        assignRows.length > 0
          ? { ok: true }
          : {
              ok: false,
              message: "Missing index: v4_job_assignments_job_uniq",
              migration: "0131_v4_job_assignments_job_uniq.sql",
            },
    });

    // 3. Thread uniqueness
    const threadRes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = ${schema}
      AND tablename = 'v4_message_threads'
      AND indexname = 'v4_message_threads_job_participants_uniq'
    `);
    const threadRows = (threadRes as { rows?: { indexname: string }[] })?.rows ?? [];
    results.push({
      name: "v4_message_threads_job_participants_uniq",
      result:
        threadRows.length > 0
          ? { ok: true }
          : {
              ok: false,
              message: "Missing index: v4_message_threads_job_participants_uniq",
              migration: "(check v4_message_threads schema)",
            },
    });

    // 4. Contractor trade skills table
    const tradeSkillsRes = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = 'v4_contractor_trade_skills'
      ) AS exists
    `);
    const tradeSkillsRows = (tradeSkillsRes as { rows?: { exists: boolean }[] })?.rows ?? [];
    const tradeSkillsExists = Boolean(tradeSkillsRows[0]?.exists);
    results.push({
      name: "v4_contractor_trade_skills table",
      result: tradeSkillsExists
        ? { ok: true }
        : {
            ok: false,
            message: "Missing table: v4_contractor_trade_skills",
            migration: "Run: pnpm -C apps/api exec tsx scripts/apply-contractor-trade-schema.ts",
          },
    });

    // 5. Contractor certifications table
    const certsRes = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = 'v4_contractor_certifications'
      ) AS exists
    `);
    const certsRows = (certsRes as { rows?: { exists: boolean }[] })?.rows ?? [];
    const certsExists = Boolean(certsRows[0]?.exists);
    results.push({
      name: "v4_contractor_certifications table",
      result: certsExists
        ? { ok: true }
        : {
            ok: false,
            message: "Missing table: v4_contractor_certifications",
            migration: "Run: pnpm -C apps/api exec tsx scripts/apply-contractor-trade-schema.ts",
          },
    });

    // 6. Routing status enum — type may be "RoutingStatus" (Drizzle) or "routing_status" (legacy)
    const enumRes = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = ${schema}
      AND (t.typname = 'RoutingStatus' OR t.typname = 'routing_status')
    `);
    const enumRows = (enumRes as { rows?: { enumlabel: string }[] })?.rows ?? [];
    const enumLabels = new Set(enumRows.map((r) => r.enumlabel));
    const missingEnum = REQUIRED_ROUTING_STATUS_VALUES.filter((v) => !enumLabels.has(v));
    results.push({
      name: "routing_status enum values",
      result:
        missingEnum.length === 0
          ? { ok: true }
          : {
              ok: false,
              message: `Missing enum values: ${missingEnum.join(", ")}`,
              migration: "0130_routing_status_invite_accepted.sql (or 0123_routing_status_lifecycle.sql)",
            },
    });
  } catch (err) {
    console.error("[Schema Check] Error running capability checks:", err);
    return;
  }

  // Print structured startup log
  console.log("[Schema Check]");
  let hasFailure = false;
  for (const { name, result } of results) {
    if (result.ok) {
      console.log(`  ✓ ${name} present`);
    } else {
      hasFailure = true;
      console.warn(`  ⚠ ${name} — ${result.message}`);
      if (result.migration) {
        console.warn(`    Migration ${result.migration} not applied`);
      }
    }
  }
  if (hasFailure) {
    console.warn("⚠️ Schema mismatch detected — contractor routing/accept flow may fail at runtime");
    console.warn("   Missing tables: run `pnpm -C apps/api exec tsx scripts/apply-contractor-trade-schema.ts`");
  } else {
    console.log("  ✓ routing/accept pipeline schema verified");
  }
}
