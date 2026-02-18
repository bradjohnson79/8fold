#!/usr/bin/env npx tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";

type TableDef = {
  key: string;
  table: AnyPgTable | undefined;
  verifyZero?: boolean;
};

type LegacyTableDef = {
  key: string;
  schema: string;
  name: string;
  verifyZero?: boolean;
};

function hasExecuteFlag(argv: string[]): boolean {
  return argv.includes("--execute");
}

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  if (msg.includes("does not exist")) return true;
  if (msg.includes('Failed query: select count(*)::int from "')) return true;
  return false;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCountCell(value: number | null | undefined): string {
  if (value == null) return "MISSING";
  return formatCount(value);
}

function printCounts(title: string, defs: TableDef[], counts: Record<string, number | null>): void {
  console.log(`\n=== ${title} ===`);
  for (const def of defs) {
    const value = counts[def.key];
    console.log(`${def.key.padEnd(32)} ${formatCountCell(value)}`);
  }
}

async function countRows(tx: any, table: AnyPgTable): Promise<number> {
  const rows = await tx.select({ count: sql<number>`count(*)::int` }).from(table);
  return Number(rows[0]?.count ?? 0);
}

function getTableIdentity(table: AnyPgTable): { schema: string; name: string } {
  const cfg = getTableConfig(table as any) as { schema?: string; name?: string };
  return {
    schema: String(cfg.schema ?? "public"),
    name: String(cfg.name ?? ""),
  };
}

function quoteIdent(v: string): string {
  return `"${v.replace(/"/g, "\"\"")}"`;
}

async function tableExists(tx: any, table: AnyPgTable): Promise<boolean> {
  const { schema, name } = getTableIdentity(table);
  const r = await tx.execute(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = ${schema}
        and table_name = ${name}
    ) as present
  `);
  return Boolean((r as any)?.rows?.[0]?.present);
}

async function legacyTableExists(tx: any, def: LegacyTableDef): Promise<boolean> {
  const r = await tx.execute(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = ${def.schema}
        and table_name = ${def.name}
    ) as present
  `);
  return Boolean((r as any)?.rows?.[0]?.present);
}

async function legacyCountRows(tx: any, def: LegacyTableDef): Promise<number | null> {
  const exists = await legacyTableExists(tx, def);
  if (!exists) return null;
  const rows = await tx.execute(sql.raw(`select count(*)::int as c from ${quoteIdent(def.schema)}.${quoteIdent(def.name)}`));
  return Number((rows as any)?.rows?.[0]?.c ?? 0);
}

async function collectLegacyCounts(tx: any, defs: LegacyTableDef[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const def of defs) {
    out[def.key] = await legacyCountRows(tx, def);
  }
  return out;
}

function printLegacyCounts(title: string, defs: LegacyTableDef[], counts: Record<string, number | null>): void {
  console.log(`\n=== ${title} ===`);
  for (const def of defs) {
    console.log(`${def.key.padEnd(32)} ${formatCountCell(counts[def.key])}`);
  }
}

async function deleteLegacyTables(tx: any, defs: LegacyTableDef[]): Promise<void> {
  for (const def of defs) {
    const exists = await legacyTableExists(tx, def);
    if (!exists) continue;
    await tx.execute(sql.raw(`delete from ${quoteIdent(def.schema)}.${quoteIdent(def.name)}`));
  }
}

async function truncateUsersCascade(tx: any, usersTable: AnyPgTable): Promise<void> {
  const usersIdent = getTableIdentity(usersTable);
  await tx.execute(sql.raw(`truncate table ${quoteIdent(usersIdent.schema)}.${quoteIdent(usersIdent.name)} cascade`));
}

async function collectCounts(tx: any, defs: TableDef[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const def of defs) {
    if (!def.table) throw new Error(`Missing schema table export: ${def.key}`);
    const exists = await tableExists(tx, def.table);
    if (!exists) {
      out[def.key] = null;
      continue;
    }
    try {
      out[def.key] = await countRows(tx, def.table);
    } catch (err) {
      if (isMissingTableError(err)) {
        out[def.key] = null;
        continue;
      }
      throw err;
    }
  }
  return out;
}

async function deleteInOrder(tx: any, defs: TableDef[]): Promise<void> {
  for (const def of defs) {
    if (!def.table) throw new Error(`Missing schema table export in delete order: ${def.key}`);
    const exists = await tableExists(tx, def.table);
    if (!exists) continue;
    if (def.key === "ledgerEntries") {
      const ident = getTableIdentity(def.table);
      // LedgerEntry has immutable DELETE trigger; use TRUNCATE during full reset.
      await tx.execute(sql.raw(`truncate table ${quoteIdent(ident.schema)}.${quoteIdent(ident.name)} cascade`));
      continue;
    }
    try {
      await tx.delete(def.table);
    } catch (err) {
      const cause = (err as any)?.cause;
      const message = String((err as any)?.message ?? err ?? "delete failed");
      const extra = [
        cause?.code ? `code=${cause.code}` : null,
        cause?.constraint ? `constraint=${cause.constraint}` : null,
        cause?.table ? `table=${cause.table}` : null,
        cause?.detail ? `detail=${cause.detail}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      throw new Error(`Delete failed on ${def.key}. ${message}${extra ? ` (${extra})` : ""}`);
    }
  }
}

async function main() {
  const execute = hasExecuteFlag(process.argv.slice(2));

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(scriptDir, "..", ".env.local") });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (apps/api/.env.local)");
  }

  const { db } = await import("../db/drizzle");
  const schema = await import("../db/schema");
  const sessionSchema = await import("../db/schema/session");
  const adminUserSchema = await import("../db/schema/adminUser");
  const adminSessionSchema = await import("../db/schema/adminSession");
  const escrowSchema = await import("../db/schema/escrow");
  const partsMaterialRequestSchema = await import("../db/schema/partsMaterialRequest");
  const disputeEvidenceSchema = await import("../db/schema/disputeEvidence");
  const disputeVoteSchema = await import("../db/schema/disputeVote");
  const sendQueueSchema = await import("../db/schema/sendQueue");
  const sendCounterSchema = await import("../db/schema/sendCounter");

  const allTables: TableDef[] = [
    { key: "users", table: schema.users },
    { key: "sessions", table: sessionSchema.sessions },
    { key: "adminUsers", table: adminUserSchema.adminUsers },
    { key: "adminSessions", table: adminSessionSchema.adminSessions },
    { key: "routers", table: schema.routers },
    { key: "routerProfiles", table: schema.routerProfiles },
    { key: "contractors", table: schema.contractors },
    { key: "contractorAccounts", table: schema.contractorAccounts },
    { key: "jobPosters", table: schema.jobPosters },
    { key: "jobPosterProfiles", table: schema.jobPosterProfiles },
    { key: "jobs", table: schema.jobs },
    { key: "jobDrafts", table: schema.jobDrafts },
    { key: "jobAssignments", table: schema.jobAssignments },
    { key: "jobDispatches", table: schema.jobDispatches },
    { key: "jobHolds", table: schema.jobHolds },
    { key: "jobMessages", table: schema.messages },
    { key: "jobConversations", table: schema.conversations },
    { key: "jobEvents", table: schema.auditLogs },
    { key: "jobAttachments", table: schema.jobPhotos },
    { key: "jobPayments", table: schema.jobPayments },
    { key: "routerRewards", table: schema.routerRewards },
    { key: "repeatContractorRequests", table: schema.repeatContractorRequests },
    { key: "payoutMethods", table: schema.payoutMethods },
    { key: "payoutRequests", table: schema.payoutRequests },
    { key: "payouts", table: schema.payouts },
    { key: "ledgerEntries", table: schema.ledgerEntries },
    { key: "contractorLedgerEntries", table: schema.contractorLedgerEntries },
    { key: "contractorPayouts", table: schema.contractorPayouts },
    { key: "escrows", table: escrowSchema.escrows },
    { key: "materialsRequests", table: schema.materialsRequests },
    { key: "materialsPayments", table: schema.materialsPayments },
    { key: "materialsItems", table: schema.materialsItems },
    { key: "materialsEscrows", table: schema.materialsEscrows },
    { key: "materialsEscrowLedgerEntries", table: schema.materialsEscrowLedgerEntries },
    { key: "materialsReceiptSubmissions", table: schema.materialsReceiptSubmissions },
    { key: "materialsReceiptFiles", table: schema.materialsReceiptFiles },
    { key: "partsMaterialRequests", table: partsMaterialRequestSchema.partsMaterialRequests },
    { key: "supportTickets", table: schema.supportTickets },
    { key: "supportMessages", table: schema.supportMessages },
    { key: "supportAttachments", table: schema.supportAttachments },
    { key: "disputeCases", table: schema.disputeCases },
    { key: "disputeAlerts", table: schema.disputeAlerts },
    { key: "disputeEvidence", table: disputeEvidenceSchema.disputeEvidence },
    { key: "disputeVotes", table: disputeVoteSchema.disputeVotes },
    { key: "disputeEnforcementActions", table: schema.disputeEnforcementActions },
    { key: "stripeWebhookEvents", table: schema.stripeWebhookEvents },
    { key: "jobPosterCredits", table: schema.jobPosterCredits },
    { key: "notificationDeliveries", table: schema.notificationDeliveries },
    { key: "monitoringEvents", table: schema.monitoringEvents },
    { key: "internalAccountFlags", table: schema.internalAccountFlags },
    { key: "adminRouterContexts", table: schema.adminRouterContexts },
    { key: "routingHubs", table: schema.routingHubs },
    { key: "sendQueue", table: sendQueueSchema.sendQueue },
    { key: "sendCounters", table: sendCounterSchema.sendCounters },
    { key: "directories", table: schema.directories },
    { key: "countryContext", table: schema.countryContext },
    { key: "regionalContext", table: schema.regionalContext },
    { key: "submissions", table: schema.submissions },
    { key: "backlinks", table: schema.backlinks },
  ];
  const dbSchemaName = getTableIdentity(schema.users).schema;
  const legacyTables: LegacyTableDef[] = [
    { key: "legacySessions", schema: dbSchemaName, name: "Session" },
    { key: "authTokens", schema: dbSchemaName, name: "AuthToken" },
  ];

  // FK-safe delete order:
  // a) dependent domain tables
  // b) financial tables
  // c) messaging tables
  // d) support/dispute tables
  // e) referral/reward tables
  // f) sessions
  // g) finally users
  const deleteOrder: TableDef[] = [
    { key: "supportAttachments", table: schema.supportAttachments },
    { key: "materialsReceiptFiles", table: schema.materialsReceiptFiles },
    { key: "materialsReceiptSubmissions", table: schema.materialsReceiptSubmissions },
    { key: "materialsEscrowLedgerEntries", table: schema.materialsEscrowLedgerEntries },
    { key: "materialsItems", table: schema.materialsItems },
    { key: "partsMaterialRequests", table: partsMaterialRequestSchema.partsMaterialRequests },
    { key: "jobDispatches", table: schema.jobDispatches },
    { key: "jobAssignments", table: schema.jobAssignments },
    { key: "jobHolds", table: schema.jobHolds },
    { key: "jobAttachments", table: schema.jobPhotos },
    { key: "adminRouterContexts", table: schema.adminRouterContexts },
    { key: "internalAccountFlags", table: schema.internalAccountFlags },
    { key: "notificationDeliveries", table: schema.notificationDeliveries },
    { key: "monitoringEvents", table: schema.monitoringEvents },
    { key: "sendQueue", table: sendQueueSchema.sendQueue },
    { key: "sendCounters", table: sendCounterSchema.sendCounters },

    { key: "payouts", table: schema.payouts },
    { key: "payoutRequests", table: schema.payoutRequests },
    { key: "payoutMethods", table: schema.payoutMethods },
    { key: "contractorLedgerEntries", table: schema.contractorLedgerEntries },
    { key: "contractorPayouts", table: schema.contractorPayouts },
    { key: "escrows", table: escrowSchema.escrows },
    { key: "materialsPayments", table: schema.materialsPayments },
    { key: "materialsEscrows", table: schema.materialsEscrows },
    { key: "jobPayments", table: schema.jobPayments },
    { key: "jobPosterCredits", table: schema.jobPosterCredits },
    { key: "stripeWebhookEvents", table: schema.stripeWebhookEvents },

    { key: "jobMessages", table: schema.messages },
    { key: "jobConversations", table: schema.conversations },
    { key: "jobEvents", table: schema.auditLogs },

    { key: "supportMessages", table: schema.supportMessages },
    { key: "supportTickets", table: schema.supportTickets },
    { key: "disputeEvidence", table: disputeEvidenceSchema.disputeEvidence },
    { key: "disputeVotes", table: disputeVoteSchema.disputeVotes },
    { key: "disputeEnforcementActions", table: schema.disputeEnforcementActions },
    { key: "disputeAlerts", table: schema.disputeAlerts },
    { key: "disputeCases", table: schema.disputeCases },

    { key: "routerRewards", table: schema.routerRewards },
    { key: "repeatContractorRequests", table: schema.repeatContractorRequests },
    { key: "routingHubs", table: schema.routingHubs },

    { key: "materialsRequests", table: schema.materialsRequests },
    { key: "jobDrafts", table: schema.jobDrafts },
    { key: "jobs", table: schema.jobs },
    { key: "submissions", table: schema.submissions },
    { key: "backlinks", table: schema.backlinks },
    { key: "directories", table: schema.directories },
    { key: "countryContext", table: schema.countryContext },
    { key: "regionalContext", table: schema.regionalContext },

    { key: "routerProfiles", table: schema.routerProfiles },
    { key: "contractorAccounts", table: schema.contractorAccounts },
    { key: "jobPosterProfiles", table: schema.jobPosterProfiles },
    { key: "routers", table: schema.routers },
    { key: "contractors", table: schema.contractors },
    { key: "jobPosters", table: schema.jobPosters },
    { key: "ledgerEntries", table: schema.ledgerEntries },

    { key: "adminSessions", table: adminSessionSchema.adminSessions },
    { key: "sessions", table: sessionSchema.sessions },
    { key: "adminUsers", table: adminUserSchema.adminUsers },
  ];

  console.log("FULL SYSTEM RESET");
  console.log(`mode=${execute ? "EXECUTE" : "DRY_RUN"}`);
  console.log("dry-run is default; pass --execute to apply deletions");

  const missing = allTables.filter((def) => !def.table).map((def) => def.key);
  if (missing.length) {
    throw new Error(`Missing schema exports for tables: ${missing.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    const before = await collectCounts(tx, allTables);
    const legacyBefore = await collectLegacyCounts(tx, legacyTables);
    printCounts("TABLE COUNTS BEFORE", allTables, before);
    printLegacyCounts("LEGACY TABLE COUNTS BEFORE", legacyTables, legacyBefore);

    if (!execute) {
      const afterDryRun = await collectCounts(tx, allTables);
      const legacyAfterDryRun = await collectLegacyCounts(tx, legacyTables);
      printCounts("TABLE COUNTS AFTER (DRY RUN, NO CHANGES)", allTables, afterDryRun);
      printLegacyCounts("LEGACY TABLE COUNTS AFTER (DRY RUN, NO CHANGES)", legacyTables, legacyAfterDryRun);
      console.log("\n[DRY RUN] No rows deleted.");
      return;
    }

    await deleteLegacyTables(tx, legacyTables);
    await deleteInOrder(tx, deleteOrder);
    await truncateUsersCascade(tx, schema.users);

    const after = await collectCounts(tx, allTables);
    const legacyAfter = await collectLegacyCounts(tx, legacyTables);
    printCounts("TABLE COUNTS AFTER EXECUTE", allTables, after);
    printLegacyCounts("LEGACY TABLE COUNTS AFTER EXECUTE", legacyTables, legacyAfter);

    if (after.users == null) {
      throw new Error("Verification failed: users table is missing");
    }
    if (after.jobs == null) {
      throw new Error("Verification failed: jobs table is missing");
    }
    const failed = allTables.filter((def) => {
      const value = after[def.key];
      return (def.verifyZero ?? true) && value != null && value !== 0;
    });
    if (after.users !== 0) {
      throw new Error(`Verification failed: users=${String(after.users)}`);
    }
    if (after.jobs !== 0) {
      throw new Error(`Verification failed: jobs=${String(after.jobs)}`);
    }
    if (failed.length) {
      const summary = failed.map((def) => `${def.key}=${String(after[def.key])}`).join(", ");
      throw new Error(`Verification failed, non-zero tables: ${summary}`);
    }
    const failedLegacy = legacyTables.filter((def) => {
      const value = legacyAfter[def.key];
      return (def.verifyZero ?? true) && value != null && value !== 0;
    });
    if (failedLegacy.length) {
      const summary = failedLegacy.map((def) => `${def.key}=${String(legacyAfter[def.key])}`).join(", ");
      throw new Error(`Verification failed, non-zero legacy tables: ${summary}`);
    }

    console.log("\n[EXECUTE] Reset completed successfully. All tracked domain tables are empty.");
  });
}

main().catch((err) => {
  console.error(String((err as any)?.message ?? err));
  process.exit(1);
});
