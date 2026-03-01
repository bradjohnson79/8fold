import { index, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const stripeEventsLog = dbSchema.table(
  "stripe_events_log",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    objectId: text("object_id"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    typeIdx: index("stripe_events_log_type_idx").on(t.type),
    receivedAtIdx: index("stripe_events_log_received_at_idx").on(t.receivedAt),
  }),
);

export const stripePaymentIntentSnapshots = dbSchema.table(
  "stripe_payment_intent_snapshots",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    customerId: text("customer_id"),
    latestChargeId: text("latest_charge_id"),
    createdUnix: integer("created_unix"),
    jobId: text("job_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("stripe_pi_snapshots_status_idx").on(t.status),
    createdUnixIdx: index("stripe_pi_snapshots_created_unix_idx").on(t.createdUnix),
    jobIdx: index("stripe_pi_snapshots_job_idx").on(t.jobId),
    lastSyncedIdx: index("stripe_pi_snapshots_last_synced_idx").on(t.lastSyncedAt),
  }),
);

export const stripeChargeSnapshots = dbSchema.table(
  "stripe_charge_snapshots",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id"),
    status: text("status").notNull(),
    amount: integer("amount").notNull().default(0),
    amountRefunded: integer("amount_refunded").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    createdUnix: integer("created_unix"),
    jobId: text("job_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("stripe_charge_snapshots_status_idx").on(t.status),
    createdUnixIdx: index("stripe_charge_snapshots_created_unix_idx").on(t.createdUnix),
    paymentIntentIdx: index("stripe_charge_snapshots_pi_idx").on(t.paymentIntentId),
    jobIdx: index("stripe_charge_snapshots_job_idx").on(t.jobId),
    lastSyncedIdx: index("stripe_charge_snapshots_last_synced_idx").on(t.lastSyncedAt),
  }),
);

export const stripeTransferSnapshots = dbSchema.table(
  "stripe_transfer_snapshots",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    destinationAccountId: text("destination_account_id"),
    sourceTransactionId: text("source_transaction_id"),
    createdUnix: integer("created_unix"),
    jobId: text("job_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("stripe_transfer_snapshots_status_idx").on(t.status),
    createdUnixIdx: index("stripe_transfer_snapshots_created_unix_idx").on(t.createdUnix),
    destinationIdx: index("stripe_transfer_snapshots_dest_idx").on(t.destinationAccountId),
    jobIdx: index("stripe_transfer_snapshots_job_idx").on(t.jobId),
    lastSyncedIdx: index("stripe_transfer_snapshots_last_synced_idx").on(t.lastSyncedAt),
  }),
);

export const stripeRefundSnapshots = dbSchema.table(
  "stripe_refund_snapshots",
  {
    id: text("id").primaryKey(),
    chargeId: text("charge_id"),
    paymentIntentId: text("payment_intent_id"),
    status: text("status").notNull(),
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    reason: text("reason"),
    createdUnix: integer("created_unix"),
    jobId: text("job_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("stripe_refund_snapshots_status_idx").on(t.status),
    createdUnixIdx: index("stripe_refund_snapshots_created_unix_idx").on(t.createdUnix),
    chargeIdx: index("stripe_refund_snapshots_charge_idx").on(t.chargeId),
    paymentIntentIdx: index("stripe_refund_snapshots_pi_idx").on(t.paymentIntentId),
    jobIdx: index("stripe_refund_snapshots_job_idx").on(t.jobId),
    lastSyncedIdx: index("stripe_refund_snapshots_last_synced_idx").on(t.lastSyncedAt),
  }),
);

export const stripeSyncRuns = dbSchema.table(
  "stripe_sync_runs",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    fromAt: timestamp("from_at", { withTimezone: true, mode: "date" }).notNull(),
    toAt: timestamp("to_at", { withTimezone: true, mode: "date" }).notNull(),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    triggeredBy: text("triggered_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    modeIdx: index("stripe_sync_runs_mode_idx").on(t.mode),
    createdIdx: index("stripe_sync_runs_created_at_idx").on(t.createdAt),
    windowIdx: index("stripe_sync_runs_window_idx").on(t.fromAt, t.toAt),
  }),
);
