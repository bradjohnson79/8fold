import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  stripeChargeSnapshots,
  stripeEventsLog,
  stripePaymentIntentSnapshots,
  stripeRefundSnapshots,
  stripeSyncRuns,
  stripeTransferSnapshots,
  v4AdminSyncCheckpoints,
} from "@/db/schema";
import {
  fetchCharges,
  fetchPaymentIntents,
  fetchRefunds,
  fetchSinglePaymentIntent,
  fetchTransfers,
} from "./stripeClient";

type Executor = typeof db | any;

export type SyncCounts = { inserted: number; updated: number; skipped: number };

export type StripeSyncResult = {
  from: string;
  to: string;
  paymentIntents: SyncCounts;
  charges: SyncCounts;
  transfers: SyncCounts;
  refunds: SyncCounts;
  totals: SyncCounts;
  durationMs: number;
  mode: "range" | "single_payment_intent" | "transfers_only" | "latest_24h";
};

function getObjectMetadata(input: any): Record<string, unknown> {
  return (input && typeof input.metadata === "object" && input.metadata) || {};
}

function extractJobId(input: any): string | null {
  const metadata = getObjectMetadata(input) as Record<string, unknown>;
  const keys = ["jobId", "job_id", "jobID"];
  for (const key of keys) {
    const value = String(metadata[key] ?? "").trim();
    if (value) return value;
  }
  const transferGroup = String(input?.transfer_group ?? "").trim();
  if (transferGroup.startsWith("job:")) return transferGroup.slice(4);
  return null;
}

async function getExistingIdSet(
  table: any,
  idColumn: any,
  ids: string[],
  exec: Executor,
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await exec
    .select({ id: idColumn })
    .from(table)
    .where(inArray(idColumn, ids));
  return new Set(rows.map((r: any) => String(r.id)));
}

async function upsertPaymentIntents(items: Stripe.PaymentIntent[], exec: Executor): Promise<SyncCounts> {
  if (!items.length) return { inserted: 0, updated: 0, skipped: 0 };
  const ids = items.map((x) => x.id);
  const existing = await getExistingIdSet(stripePaymentIntentSnapshots, stripePaymentIntentSnapshots.id, ids, exec);
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const pi of items) {
    const isExisting = existing.has(pi.id);
    const values = {
      id: pi.id,
      status: String(pi.status ?? "unknown"),
      amount: Number(pi.amount ?? 0),
      currency: String(pi.currency ?? "usd"),
      customerId: pi.customer ? String(pi.customer) : null,
      latestChargeId: pi.latest_charge ? String(pi.latest_charge) : null,
      createdUnix: Number(pi.created ?? 0),
      jobId: extractJobId(pi),
      metadata: getObjectMetadata(pi),
      raw: pi as unknown as Record<string, unknown>,
      firstSeenAt: now,
      lastSyncedAt: now,
    } as const;
    await exec
      .insert(stripePaymentIntentSnapshots)
      .values(values as any)
      .onConflictDoUpdate({
        target: stripePaymentIntentSnapshots.id,
        set: {
          status: values.status,
          amount: values.amount,
          currency: values.currency,
          customerId: values.customerId,
          latestChargeId: values.latestChargeId,
          createdUnix: values.createdUnix,
          jobId: values.jobId,
          metadata: values.metadata,
          raw: values.raw,
          lastSyncedAt: values.lastSyncedAt,
        } as any,
      });
    if (isExisting) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, skipped: 0 };
}

async function upsertCharges(items: Stripe.Charge[], exec: Executor): Promise<SyncCounts> {
  if (!items.length) return { inserted: 0, updated: 0, skipped: 0 };
  const ids = items.map((x) => x.id);
  const existing = await getExistingIdSet(stripeChargeSnapshots, stripeChargeSnapshots.id, ids, exec);
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const charge of items) {
    const isExisting = existing.has(charge.id);
    const values = {
      id: charge.id,
      paymentIntentId: charge.payment_intent ? String(charge.payment_intent) : null,
      status: String(charge.status ?? "unknown"),
      amount: Number(charge.amount ?? 0),
      amountRefunded: Number(charge.amount_refunded ?? 0),
      currency: String(charge.currency ?? "usd"),
      createdUnix: Number(charge.created ?? 0),
      jobId: extractJobId(charge),
      metadata: getObjectMetadata(charge),
      raw: charge as unknown as Record<string, unknown>,
      firstSeenAt: now,
      lastSyncedAt: now,
    } as const;
    await exec
      .insert(stripeChargeSnapshots)
      .values(values as any)
      .onConflictDoUpdate({
        target: stripeChargeSnapshots.id,
        set: {
          paymentIntentId: values.paymentIntentId,
          status: values.status,
          amount: values.amount,
          amountRefunded: values.amountRefunded,
          currency: values.currency,
          createdUnix: values.createdUnix,
          jobId: values.jobId,
          metadata: values.metadata,
          raw: values.raw,
          lastSyncedAt: values.lastSyncedAt,
        } as any,
      });
    if (isExisting) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, skipped: 0 };
}

async function upsertTransfers(items: Stripe.Transfer[], exec: Executor): Promise<SyncCounts> {
  if (!items.length) return { inserted: 0, updated: 0, skipped: 0 };
  const ids = items.map((x) => x.id);
  const existing = await getExistingIdSet(stripeTransferSnapshots, stripeTransferSnapshots.id, ids, exec);
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const transfer of items) {
    const isExisting = existing.has(transfer.id);
    const values = {
      id: transfer.id,
      status: transfer.reversed ? "reversed" : "created",
      amount: Number(transfer.amount ?? 0),
      currency: String(transfer.currency ?? "usd"),
      destinationAccountId: transfer.destination ? String(transfer.destination) : null,
      sourceTransactionId: transfer.source_transaction ? String(transfer.source_transaction) : null,
      createdUnix: Number(transfer.created ?? 0),
      jobId: extractJobId(transfer),
      metadata: getObjectMetadata(transfer),
      raw: transfer as unknown as Record<string, unknown>,
      firstSeenAt: now,
      lastSyncedAt: now,
    } as const;
    await exec
      .insert(stripeTransferSnapshots)
      .values(values as any)
      .onConflictDoUpdate({
        target: stripeTransferSnapshots.id,
        set: {
          status: values.status,
          amount: values.amount,
          currency: values.currency,
          destinationAccountId: values.destinationAccountId,
          sourceTransactionId: values.sourceTransactionId,
          createdUnix: values.createdUnix,
          jobId: values.jobId,
          metadata: values.metadata,
          raw: values.raw,
          lastSyncedAt: values.lastSyncedAt,
        } as any,
      });
    if (isExisting) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, skipped: 0 };
}

async function upsertRefunds(items: Stripe.Refund[], exec: Executor): Promise<SyncCounts> {
  if (!items.length) return { inserted: 0, updated: 0, skipped: 0 };
  const ids = items.map((x) => x.id);
  const existing = await getExistingIdSet(stripeRefundSnapshots, stripeRefundSnapshots.id, ids, exec);
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const refund of items) {
    const isExisting = existing.has(refund.id);
    const values = {
      id: refund.id,
      chargeId: refund.charge ? String(refund.charge) : null,
      paymentIntentId: refund.payment_intent ? String(refund.payment_intent) : null,
      status: String(refund.status ?? "unknown"),
      amount: Number(refund.amount ?? 0),
      currency: String(refund.currency ?? "usd"),
      reason: refund.reason ? String(refund.reason) : null,
      createdUnix: Number(refund.created ?? 0),
      jobId: extractJobId(refund),
      metadata: getObjectMetadata(refund),
      raw: refund as unknown as Record<string, unknown>,
      firstSeenAt: now,
      lastSyncedAt: now,
    } as const;
    await exec
      .insert(stripeRefundSnapshots)
      .values(values as any)
      .onConflictDoUpdate({
        target: stripeRefundSnapshots.id,
        set: {
          chargeId: values.chargeId,
          paymentIntentId: values.paymentIntentId,
          status: values.status,
          amount: values.amount,
          currency: values.currency,
          reason: values.reason,
          createdUnix: values.createdUnix,
          jobId: values.jobId,
          metadata: values.metadata,
          raw: values.raw,
          lastSyncedAt: values.lastSyncedAt,
        } as any,
      });
    if (isExisting) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, skipped: 0 };
}

function addCounts(...counts: SyncCounts[]): SyncCounts {
  return counts.reduce(
    (acc, cur) => ({
      inserted: acc.inserted + cur.inserted,
      updated: acc.updated + cur.updated,
      skipped: acc.skipped + cur.skipped,
    }),
    { inserted: 0, updated: 0, skipped: 0 },
  );
}

async function writeSyncRun(input: {
  mode: StripeSyncResult["mode"];
  from: Date;
  to: Date;
  totals: SyncCounts;
  durationMs: number;
  triggeredBy?: string | null;
}) {
  await db.insert(stripeSyncRuns).values({
    id: randomUUID(),
    mode: input.mode,
    fromAt: input.from,
    toAt: input.to,
    insertedCount: input.totals.inserted,
    updatedCount: input.totals.updated,
    skippedCount: input.totals.skipped,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    triggeredBy: input.triggeredBy ?? null,
    createdAt: new Date(),
  } as any);

  await db
    .insert(v4AdminSyncCheckpoints)
    .values({
      key: "stripe_gateway_last_sync",
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .onConflictDoUpdate({
      target: v4AdminSyncCheckpoints.key,
      set: { lastSyncedAt: new Date(), updatedAt: new Date() } as any,
    });
}

export async function syncStripeRange(input: {
  from: Date;
  to: Date;
  triggeredBy?: string | null;
  mode?: StripeSyncResult["mode"];
}): Promise<StripeSyncResult> {
  const started = Date.now();
  console.info("[STRIPE_SYNC_START]", {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    mode: input.mode ?? "range",
  });
  const [paymentIntents, charges, transfers, refunds] = await Promise.all([
    fetchPaymentIntents({ fromDate: input.from, toDate: input.to }),
    fetchCharges({ fromDate: input.from, toDate: input.to }),
    fetchTransfers({ fromDate: input.from, toDate: input.to }),
    fetchRefunds({ fromDate: input.from, toDate: input.to }),
  ]);

  const result = await db.transaction(async (tx) => {
    const pi = await upsertPaymentIntents(paymentIntents, tx);
    const ch = await upsertCharges(charges, tx);
    const tr = await upsertTransfers(transfers, tx);
    const rf = await upsertRefunds(refunds, tx);
    const totals = addCounts(pi, ch, tr, rf);
    return { pi, ch, tr, rf, totals };
  });

  const durationMs = Date.now() - started;
  await writeSyncRun({
    mode: input.mode ?? "range",
    from: input.from,
    to: input.to,
    totals: result.totals,
    durationMs,
    triggeredBy: input.triggeredBy ?? null,
  });

  console.info("[STRIPE_SYNC_COMPLETE]", {
    mode: input.mode ?? "range",
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    durationMs,
    totals: result.totals,
  });

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    paymentIntents: result.pi,
    charges: result.ch,
    transfers: result.tr,
    refunds: result.rf,
    totals: result.totals,
    durationMs,
    mode: input.mode ?? "range",
  };
}

export async function syncSinglePaymentIntent(
  stripePaymentIntentId: string,
  input?: { triggeredBy?: string | null },
): Promise<StripeSyncResult> {
  const started = Date.now();
  const pi = await fetchSinglePaymentIntent(stripePaymentIntentId);
  const from = new Date((Number(pi.created ?? 0) || Math.floor(Date.now() / 1000)) * 1000);
  const to = new Date();
  const result = await db.transaction(async (tx) => {
    const piCounts = await upsertPaymentIntents([pi], tx);
    const totals = addCounts(piCounts);
    return { piCounts, totals };
  });
  const durationMs = Date.now() - started;
  await writeSyncRun({
    mode: "single_payment_intent",
    from,
    to,
    totals: result.totals,
    durationMs,
    triggeredBy: input?.triggeredBy ?? null,
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    paymentIntents: result.piCounts,
    charges: { inserted: 0, updated: 0, skipped: 0 },
    transfers: { inserted: 0, updated: 0, skipped: 0 },
    refunds: { inserted: 0, updated: 0, skipped: 0 },
    totals: result.totals,
    durationMs,
    mode: "single_payment_intent",
  };
}

export async function syncStripeTransfersOnly(input: {
  from: Date;
  to: Date;
  triggeredBy?: string | null;
}): Promise<StripeSyncResult> {
  const started = Date.now();
  const transfers = await fetchTransfers({ fromDate: input.from, toDate: input.to });
  const tr = await db.transaction(async (tx) => await upsertTransfers(transfers, tx));
  const durationMs = Date.now() - started;
  await writeSyncRun({
    mode: "transfers_only",
    from: input.from,
    to: input.to,
    totals: tr,
    durationMs,
    triggeredBy: input.triggeredBy ?? null,
  });

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    paymentIntents: { inserted: 0, updated: 0, skipped: 0 },
    charges: { inserted: 0, updated: 0, skipped: 0 },
    transfers: tr,
    refunds: { inserted: 0, updated: 0, skipped: 0 },
    totals: tr,
    durationMs,
    mode: "transfers_only",
  };
}

export async function syncLatest24Hours(input?: { triggeredBy?: string | null }) {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return await syncStripeRange({ from, to, mode: "latest_24h", triggeredBy: input?.triggeredBy ?? null });
}

export async function logStripeEventIfNew(event: Stripe.Event, tx?: Executor): Promise<boolean> {
  const exec = tx ?? db;
  const inserted = await exec
    .insert(stripeEventsLog)
    .values({
      id: event.id,
      type: event.type,
      objectId: typeof (event.data.object as any)?.id === "string" ? String((event.data.object as any).id) : null,
      payload: event as unknown as Record<string, unknown>,
      receivedAt: new Date(),
      processedAt: null,
    } as any)
    .onConflictDoNothing()
    .returning({ id: stripeEventsLog.id });
  return Boolean(inserted[0]?.id);
}

export async function markStripeEventProcessed(eventId: string, tx?: Executor): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(stripeEventsLog)
    .set({ processedAt: new Date() } as any)
    .where(eq(stripeEventsLog.id, eventId));
}

export async function snapshotFromWebhookEvent(event: Stripe.Event, tx?: Executor): Promise<void> {
  const exec = tx ?? db;
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await upsertPaymentIntents([pi], exec);
    return;
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    await upsertCharges([charge], exec);
    return;
  }
  if (event.type === "transfer.created" || event.type === "transfer.reversed") {
    const transfer = event.data.object as Stripe.Transfer;
    await upsertTransfers([transfer], exec);
    return;
  }
}

export async function getStripeGatewayHealth() {
  const [lastWebhook] = await db
    .select({
      id: stripeEventsLog.id,
      type: stripeEventsLog.type,
      receivedAt: stripeEventsLog.receivedAt,
    })
    .from(stripeEventsLog)
    .orderBy(desc(stripeEventsLog.receivedAt))
    .limit(1);

  const [lastSync] = await db
    .select({
      id: stripeSyncRuns.id,
      mode: stripeSyncRuns.mode,
      createdAt: stripeSyncRuns.createdAt,
      durationMs: stripeSyncRuns.durationMs,
    })
    .from(stripeSyncRuns)
    .orderBy(desc(stripeSyncRuns.createdAt))
    .limit(1);

  return {
    lastWebhook: lastWebhook ?? null,
    lastSync: lastSync ?? null,
  };
}
