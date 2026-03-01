import { createHash } from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  financialIntegrityAlerts,
  financialIntegrityAlertStatusEnum,
  financialIntegrityAlertTypeEnum,
  financialIntegritySeverityEnum,
  jobs,
  transferRecords,
  v4AdminSyncCheckpoints,
} from "@/db/schema";
import { createAdminNotifications, type NotificationPriority } from "@/src/services/notifications/notificationService";
import { getReconciliationDetails, reconcileJob } from "@/src/services/stripeGateway/reconciliationService";

type FinancialIntegrityAlertType = (typeof financialIntegrityAlertTypeEnum.enumValues)[number];
type FinancialIntegritySeverity = (typeof financialIntegritySeverityEnum.enumValues)[number];
type FinancialIntegrityAlertStatus = (typeof financialIntegrityAlertStatusEnum.enumValues)[number];

type Executor = typeof db | any;

type RecentJob = {
  id: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  releasedAt: Date | null;
  payoutStatus: string | null;
  paymentStatus: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundedAt: Date | null;
};

type AlertCandidate = {
  jobId: string | null;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  alertType: FinancialIntegrityAlertType;
  severity: FinancialIntegritySeverity;
  internalTotalCents: number;
  stripeTotalCents: number;
  differenceCents: number;
  metadata: Record<string, unknown>;
};

export type FinancialIntegrityAlertListItem = {
  id: string;
  jobId: string | null;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  alertType: FinancialIntegrityAlertType;
  severity: FinancialIntegritySeverity;
  internalTotalCents: number;
  stripeTotalCents: number;
  differenceCents: number;
  status: FinancialIntegrityAlertStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedByAdminId: string | null;
};

export type FinancialIntegrityRunResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  jobsScanned: number;
  jobsChecked: number;
  mismatches: number;
  alertsCreated: number;
  duplicateAlertsSkipped: number;
  failedJobs: number;
  timedOut: boolean;
  maxJobs: number;
};

type RuntimeMetrics = {
  lastRunMs: number;
  totalAlertsCreated: number;
  lastRunAt: string | null;
};

const METRICS_KEY = "__8FOLD_FINANCIAL_INTEGRITY_RUNTIME__";

function getRuntimeMetrics(): RuntimeMetrics {
  const g = globalThis as any;
  if (!g[METRICS_KEY]) {
    g[METRICS_KEY] = {
      lastRunMs: 0,
      totalAlertsCreated: 0,
      lastRunAt: null,
    } satisfies RuntimeMetrics;
  }
  return g[METRICS_KEY] as RuntimeMetrics;
}

function asInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function netInternal(input: { chargeCents: number; refundCents: number; transferCents: number }): number {
  return asInt(input.chargeCents) - asInt(input.refundCents) - asInt(input.transferCents);
}

function buildDedupeHash(jobId: string | null, alertType: FinancialIntegrityAlertType): string {
  return createHash("sha256")
    .update(`${jobId ?? "global"}:${alertType}`)
    .digest("hex");
}

function severityForAlert(input: { alertType: FinancialIntegrityAlertType; differenceCents: number }): FinancialIntegritySeverity {
  const absDiff = Math.abs(asInt(input.differenceCents));
  if (input.alertType === "MISSING_CHARGE") return "CRITICAL";
  if (input.alertType === "MISSING_TRANSFER") return "CRITICAL";
  if (input.alertType === "DOUBLE_TRANSFER") return "CRITICAL";
  if (input.alertType === "STRIPE_AMOUNT_MISMATCH") return absDiff > 500 ? "CRITICAL" : "WARNING";
  if (input.alertType === "UNRECONCILED_PAYMENT_AFTER_24H") return "WARNING";
  if (input.alertType === "MISSING_REFUND") return "INFO";
  return "WARNING";
}

function mapStatusToPrimaryAlertType(status: string): FinancialIntegrityAlertType | null {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "MISSING_CHARGE") return "MISSING_CHARGE";
  if (normalized === "MISSING_TRANSFER") return "MISSING_TRANSFER";
  if (normalized === "UNDERPAID" || normalized === "OVERPAID" || normalized === "MISMATCH") return "STRIPE_AMOUNT_MISMATCH";
  return null;
}

function toNotificationPriority(severity: FinancialIntegritySeverity): NotificationPriority {
  if (severity === "CRITICAL") return "CRITICAL";
  if (severity === "WARNING") return "HIGH";
  return "NORMAL";
}

function formatDelta(cents: number): string {
  const value = asInt(cents);
  const dollars = (Math.abs(value) / 100).toFixed(2);
  return value < 0 ? `-$${dollars}` : `$${dollars}`;
}

async function notifyAdminsForAlert(alert: FinancialIntegrityAlertListItem): Promise<void> {
  const message = `${alert.alertType} on job ${alert.jobId ?? "unknown"} (delta ${formatDelta(alert.differenceCents)}).`;
  await createAdminNotifications({
    type: "FINANCIAL_INTEGRITY_ALERT",
    title: `${alert.severity} Financial Integrity Alert`,
    message,
    entityType: "FINANCIAL_INTEGRITY_ALERT",
    entityId: alert.id,
    priority: toNotificationPriority(alert.severity),
    metadata: {
      alertId: alert.id,
      alertType: alert.alertType,
      severity: alert.severity,
      jobId: alert.jobId,
      stripePaymentIntentId: alert.stripePaymentIntentId,
      stripeTransferId: alert.stripeTransferId,
      differenceCents: alert.differenceCents,
    },
    idempotencyKey: `financial_integrity_alert:${alert.id}`,
  });
  if (alert.severity === "CRITICAL") {
    console.error("[FINANCIAL_INTEGRITY_CRITICAL]", {
      alertId: alert.id,
      jobId: alert.jobId,
      alertType: alert.alertType,
      differenceCents: alert.differenceCents,
    });
  }
}

async function existingOpenAlert(
  input: { jobId: string | null; alertType: FinancialIntegrityAlertType },
  tx?: Executor,
): Promise<FinancialIntegrityAlertListItem | null> {
  const exec = tx ?? db;
  const where = input.jobId
    ? and(
        eq(financialIntegrityAlerts.jobId, input.jobId),
        eq(financialIntegrityAlerts.alertType, input.alertType),
        eq(financialIntegrityAlerts.status, "OPEN"),
      )
    : and(
        isNull(financialIntegrityAlerts.jobId),
        eq(financialIntegrityAlerts.alertType, input.alertType),
        eq(financialIntegrityAlerts.status, "OPEN"),
      );
  const rows = await exec.select().from(financialIntegrityAlerts).where(where).limit(1);
  return (rows[0] as FinancialIntegrityAlertListItem | undefined) ?? null;
}

async function createAlertIfNeeded(candidate: AlertCandidate): Promise<{ created: boolean; row: FinancialIntegrityAlertListItem | null }> {
  const existing = await existingOpenAlert({ jobId: candidate.jobId, alertType: candidate.alertType });
  if (existing) return { created: false, row: existing };

  const now = new Date();
  const metadata = {
    ...candidate.metadata,
    dedupeHash: buildDedupeHash(candidate.jobId, candidate.alertType),
    source: "financial_integrity_v1",
  };

  try {
    const inserted = await db
      .insert(financialIntegrityAlerts)
      .values({
        jobId: candidate.jobId,
        stripePaymentIntentId: candidate.stripePaymentIntentId,
        stripeTransferId: candidate.stripeTransferId,
        alertType: candidate.alertType,
        severity: candidate.severity,
        internalTotalCents: candidate.internalTotalCents,
        stripeTotalCents: candidate.stripeTotalCents,
        differenceCents: candidate.differenceCents,
        status: "OPEN",
        metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = (inserted[0] as FinancialIntegrityAlertListItem | undefined) ?? null;
    if (row) {
      await notifyAdminsForAlert(row);
      return { created: true, row };
    }
    return { created: false, row: null };
  } catch (error: any) {
    // Race-safe fallback for OPEN dedupe constraint.
    const constraint = String(error?.constraint ?? "");
    if (constraint.includes("financial_integrity_alerts_open_job_type_uq")) {
      const open = await existingOpenAlert({ jobId: candidate.jobId, alertType: candidate.alertType });
      return { created: false, row: open };
    }
    throw error;
  }
}

async function buildCandidates(job: RecentJob): Promise<AlertCandidate[]> {
  const reconciliation = await reconcileJob(job.id);
  if (reconciliation.status === "MATCHED") return [];

  const details = await getReconciliationDetails(job.id);
  const out: AlertCandidate[] = [];

  const primaryType = mapStatusToPrimaryAlertType(reconciliation.status);
  const internalNet = netInternal(details.result.internalTotals);
  const stripeNet = asInt(details.result.stripeTotals.chargeCents) - asInt(details.result.stripeTotals.refundCents) - asInt(details.result.stripeTotals.transferCents);

  if (primaryType) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: primaryType,
      severity: severityForAlert({ alertType: primaryType, differenceCents: details.result.difference }),
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        reconciliationStatus: reconciliation.status,
      },
    });
  }

  const transferRows = await db
    .select({
      role: transferRecords.role,
      status: transferRecords.status,
      stripeTransferId: transferRecords.stripeTransferId,
    })
    .from(transferRecords)
    .where(eq(transferRecords.jobId, job.id));
  const sentByRole = new Map<string, number>();
  for (const row of transferRows) {
    if (String(row.status ?? "").toUpperCase() !== "SENT") continue;
    const role = String(row.role ?? "UNKNOWN").toUpperCase();
    sentByRole.set(role, (sentByRole.get(role) ?? 0) + 1);
  }
  for (const [role, count] of sentByRole.entries()) {
    if (count > 1) {
      out.push({
        jobId: job.id,
        stripePaymentIntentId: job.stripePaymentIntentId,
        stripeTransferId: transferRows.find((r) => String(r.role ?? "").toUpperCase() === role)?.stripeTransferId ?? null,
        alertType: "DOUBLE_TRANSFER",
        severity: "CRITICAL",
        internalTotalCents: internalNet,
        stripeTotalCents: stripeNet,
        differenceCents: details.result.difference,
        metadata: {
          duplicateRole: role,
          duplicateCount: count,
        },
      });
    }
  }

  const stripeRefund = asInt(details.result.stripeTotals.refundCents);
  const ledgerRefund = asInt(details.result.internalTotals.refundCents);
  if (stripeRefund > 0 && ledgerRefund === 0) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "STRIPE_REFUND_NOT_IN_LEDGER",
      severity: "WARNING",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        stripeRefundCents: stripeRefund,
        ledgerRefundCents: ledgerRefund,
      },
    });
  }
  if (ledgerRefund > 0 && stripeRefund === 0) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "LEDGER_REFUND_NOT_IN_STRIPE",
      severity: "WARNING",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        stripeRefundCents: stripeRefund,
        ledgerRefundCents: ledgerRefund,
      },
    });
  }

  const appearsRefunded = String(job.paymentStatus ?? "").toUpperCase() === "REFUNDED" || job.stripeRefundedAt instanceof Date;
  if (appearsRefunded && stripeRefund <= 0 && ledgerRefund <= 0) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "MISSING_REFUND",
      severity: "INFO",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        paymentStatus: job.paymentStatus,
      },
    });
  }

  if ((job.releasedAt instanceof Date || String(job.payoutStatus ?? "").toUpperCase() === "RELEASED") && asInt(details.result.stripeTotals.chargeCents) <= 0) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "ESCROW_RELEASE_WITHOUT_STRIPE_CAPTURE",
      severity: "CRITICAL",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        releasedAt: job.releasedAt?.toISOString() ?? null,
      },
    });
  }

  if (internalNet < 0) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "NEGATIVE_BALANCE_DRIFT",
      severity: "WARNING",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        internalNetCents: internalNet,
      },
    });
  }

  const anchor = job.updatedAt ?? job.createdAt;
  if (anchor instanceof Date && Date.now() - anchor.getTime() > 24 * 60 * 60 * 1000) {
    out.push({
      jobId: job.id,
      stripePaymentIntentId: job.stripePaymentIntentId,
      stripeTransferId: null,
      alertType: "UNRECONCILED_PAYMENT_AFTER_24H",
      severity: "WARNING",
      internalTotalCents: internalNet,
      stripeTotalCents: stripeNet,
      differenceCents: details.result.difference,
      metadata: {
        anchor: anchor.toISOString(),
      },
    });
  }

  // De-dupe candidate list before DB writes (one type per job per run).
  const deduped = new Map<string, AlertCandidate>();
  for (const candidate of out) {
    const key = `${candidate.jobId ?? "global"}:${candidate.alertType}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return [...deduped.values()];
}

async function loadRecentJobs(maxJobs: number, windowHours: number): Promise<RecentJob[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowHours) * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: jobs.id,
      createdAt: jobs.created_at,
      updatedAt: jobs.updated_at,
      releasedAt: jobs.released_at,
      payoutStatus: jobs.payout_status,
      paymentStatus: jobs.payment_status,
      stripePaymentIntentId: jobs.stripe_payment_intent_id,
      stripeRefundedAt: jobs.stripe_refunded_at,
    })
    .from(jobs)
    .where(gte(jobs.updated_at, cutoff))
    .orderBy(desc(jobs.updated_at))
    .limit(Math.max(1, Math.min(100, maxJobs)));
  return rows as RecentJob[];
}

async function writeLastRunCheckpoint(at: Date): Promise<void> {
  await db
    .insert(v4AdminSyncCheckpoints)
    .values({
      key: "financial_integrity_last_run",
      lastSyncedAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: v4AdminSyncCheckpoints.key,
      set: {
        lastSyncedAt: at,
        updatedAt: at,
      },
    });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(Object.assign(new Error("FINANCIAL_INTEGRITY_TIMEOUT"), { code: "FINANCIAL_INTEGRITY_TIMEOUT" }));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function runFinancialIntegrityCheck(input?: {
  maxJobs?: number;
  windowHours?: number;
  timeoutMs?: number;
  triggeredBy?: string | null;
}): Promise<FinancialIntegrityRunResult> {
  const startedAt = new Date();
  const maxJobs = Math.max(1, Math.min(100, Number(input?.maxJobs ?? 100) || 100));
  const windowHours = Math.max(1, Number(input?.windowHours ?? 72) || 72);
  const timeoutMs = Math.max(1_000, Number(input?.timeoutMs ?? 10_000) || 10_000);
  const hardStopAt = Date.now() + timeoutMs - 200;

  console.info("[INTEGRITY_RUN_START]", {
    startedAt: startedAt.toISOString(),
    maxJobs,
    windowHours,
    triggeredBy: input?.triggeredBy ?? null,
  });

  const run = async (): Promise<FinancialIntegrityRunResult> => {
    const jobsToCheck = await loadRecentJobs(maxJobs, windowHours);
    let jobsChecked = 0;
    let mismatches = 0;
    let alertsCreated = 0;
    let duplicateAlertsSkipped = 0;
    let failedJobs = 0;
    let timedOut = false;

    for (const job of jobsToCheck) {
      if (Date.now() >= hardStopAt) {
        timedOut = true;
        break;
      }
      jobsChecked += 1;
      try {
        const candidates = await buildCandidates(job);
        if (candidates.length > 0) mismatches += 1;
        for (const candidate of candidates) {
          const created = await createAlertIfNeeded(candidate);
          if (created.created) alertsCreated += 1;
          else duplicateAlertsSkipped += 1;
        }
      } catch (error) {
        failedJobs += 1;
        console.error("[INTEGRITY_JOB_CHECK_FAILED]", {
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    await writeLastRunCheckpoint(finishedAt);

    const runtime = getRuntimeMetrics();
    runtime.lastRunMs = durationMs;
    runtime.totalAlertsCreated += alertsCreated;
    runtime.lastRunAt = finishedAt.toISOString();

    const result: FinancialIntegrityRunResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      jobsScanned: jobsToCheck.length,
      jobsChecked,
      mismatches,
      alertsCreated,
      duplicateAlertsSkipped,
      failedJobs,
      timedOut,
      maxJobs,
    };
    console.info("[INTEGRITY_RUN_COMPLETE]", result);
    return result;
  };

  return await withTimeout(run(), timeoutMs);
}

export async function listFinancialIntegrityAlerts(input: {
  page?: number;
  pageSize?: number;
  status?: FinancialIntegrityAlertStatus | null;
  severity?: FinancialIntegritySeverity | null;
  alertType?: FinancialIntegrityAlertType | null;
  jobId?: string | null;
}) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(input.pageSize ?? 25) || 25));
  const whereParts: any[] = [];
  if (input.status) whereParts.push(eq(financialIntegrityAlerts.status, input.status));
  if (input.severity) whereParts.push(eq(financialIntegrityAlerts.severity, input.severity));
  if (input.alertType) whereParts.push(eq(financialIntegrityAlerts.alertType, input.alertType));
  if (input.jobId) whereParts.push(eq(financialIntegrityAlerts.jobId, input.jobId));
  const where = whereParts.length ? and(...whereParts) : undefined;

  const [rows, totalRows, summaryRows, checkpointRows] = await Promise.all([
    db
      .select()
      .from(financialIntegrityAlerts)
      .where(where)
      .orderBy(desc(financialIntegrityAlerts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialIntegrityAlerts)
      .where(where),
    db
      .select({
        totalOpen: sql<number>`count(*) filter (where ${financialIntegrityAlerts.status} = 'OPEN')::int`,
        criticalOpen: sql<number>`count(*) filter (where ${financialIntegrityAlerts.status} = 'OPEN' and ${financialIntegrityAlerts.severity} = 'CRITICAL')::int`,
        warningOpen: sql<number>`count(*) filter (where ${financialIntegrityAlerts.status} = 'OPEN' and ${financialIntegrityAlerts.severity} = 'WARNING')::int`,
      })
      .from(financialIntegrityAlerts),
    db
      .select({
        lastRunAt: v4AdminSyncCheckpoints.lastSyncedAt,
      })
      .from(v4AdminSyncCheckpoints)
      .where(eq(v4AdminSyncCheckpoints.key, "financial_integrity_last_run"))
      .limit(1),
  ]);

  return {
    rows: rows as FinancialIntegrityAlertListItem[],
    totalCount: asInt(totalRows[0]?.count),
    page,
    pageSize,
    summary: {
      totalOpen: asInt(summaryRows[0]?.totalOpen),
      criticalOpen: asInt(summaryRows[0]?.criticalOpen),
      warningOpen: asInt(summaryRows[0]?.warningOpen),
      lastRunAt: checkpointRows[0]?.lastRunAt ?? null,
    },
  };
}

export async function getFinancialIntegrityAlertDetail(id: string) {
  const rows = await db.select().from(financialIntegrityAlerts).where(eq(financialIntegrityAlerts.id, id)).limit(1);
  const alert = (rows[0] as FinancialIntegrityAlertListItem | undefined) ?? null;
  if (!alert) return null;

  if (!alert.jobId) {
    return {
      alert,
      reconciliation: null,
      ledgerEntries: [],
      snapshots: { paymentIntents: [], charges: [], refunds: [], transfers: [] },
      jsonDiff: {
        differenceCents: alert.differenceCents,
      },
    };
  }

  const details = await getReconciliationDetails(alert.jobId);
  const internalNet = netInternal(details.result.internalTotals);
  const stripeNet =
    asInt(details.result.stripeTotals.chargeCents) -
    asInt(details.result.stripeTotals.refundCents) -
    asInt(details.result.stripeTotals.transferCents);

  const jsonDiff = {
    internalTotals: details.result.internalTotals,
    stripeTotals: details.result.stripeTotals,
    net: {
      internal: internalNet,
      stripe: stripeNet,
      difference: details.result.difference,
    },
    fields: {
      chargeCents: {
        internal: asInt(details.result.internalTotals.chargeCents),
        stripe: asInt(details.result.stripeTotals.chargeCents),
        delta: asInt(details.result.internalTotals.chargeCents) - asInt(details.result.stripeTotals.chargeCents),
      },
      refundCents: {
        internal: asInt(details.result.internalTotals.refundCents),
        stripe: asInt(details.result.stripeTotals.refundCents),
        delta: asInt(details.result.internalTotals.refundCents) - asInt(details.result.stripeTotals.refundCents),
      },
      transferCents: {
        internal: asInt(details.result.internalTotals.transferCents),
        stripe: asInt(details.result.stripeTotals.transferCents),
        delta: asInt(details.result.internalTotals.transferCents) - asInt(details.result.stripeTotals.transferCents),
      },
    },
  };

  return {
    alert,
    reconciliation: details.result,
    ledgerEntries: details.ledgerEntries,
    snapshots: details.snapshots,
    jsonDiff,
  };
}

export async function updateFinancialIntegrityAlertStatus(input: {
  id: string;
  status: Exclude<FinancialIntegrityAlertStatus, "OPEN">;
  adminId: string;
}) {
  const now = new Date();
  const nextStatus = input.status;
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: now,
  };
  if (nextStatus === "RESOLVED") {
    patch.resolvedAt = now;
    patch.resolvedByAdminId = input.adminId;
  } else {
    patch.resolvedAt = null;
    patch.resolvedByAdminId = null;
  }

  const rows = await db
    .update(financialIntegrityAlerts)
    .set(patch as any)
    .where(eq(financialIntegrityAlerts.id, input.id))
    .returning();
  return (rows[0] as FinancialIntegrityAlertListItem | undefined) ?? null;
}

export async function getFinancialIntegrityMetricsSnapshot() {
  const [summary] = await db
    .select({
      open: sql<number>`count(*) filter (where ${financialIntegrityAlerts.status} = 'OPEN')::int`,
      critical: sql<number>`count(*) filter (where ${financialIntegrityAlerts.status} = 'OPEN' and ${financialIntegrityAlerts.severity} = 'CRITICAL')::int`,
    })
    .from(financialIntegrityAlerts);
  const runtime = getRuntimeMetrics();
  return {
    open: asInt(summary?.open),
    critical: asInt(summary?.critical),
    lastRunMs: asInt(runtime.lastRunMs),
    totalAlertsCreated: asInt(runtime.totalAlertsCreated),
    lastRunAt: runtime.lastRunAt,
  };
}
