export type IntegrityViolationSeverity = "CRITICAL" | "HIGH" | "WARN";

export type IntegrityViolation =
  | {
      type:
        | "ESCROW_MISSING"
        | "ESCROW_STATUS_MISMATCH"
        | "ESCROW_RELEASED_AT_MISSING"
        | "ESCROW_RELEASED_AT_SET_BUT_STATUS_NOT_RELEASED"
        | "ESCROW_AMOUNT_MISMATCH"
        | "TRANSFER_LEG_COUNT_MISMATCH"
        | "TRANSFER_LEG_DUPLICATE_ROLE"
        | "TRANSFER_LEG_ROLE_MISSING"
        | "TRANSFER_LEG_FAILED"
        | "TRANSFER_LEG_STATUS_NOT_SENT"
        | "TRANSFER_SUM_MISMATCH"
        | "LEDGER_EVIDENCE_MISSING"
        | "ESCROW_LEDGER_FUND_MISSING"
        | "ESCROW_LEDGER_RELEASE_MISSING"
        | "PLATFORM_LEDGER_DRIFT";
      severity: IntegrityViolationSeverity;
      jobId: string;
      message: string;
      suggestedAction?: string;
      details?: Record<string, unknown>;
    }
  | {
      type: "TRANSFER_ORPHAN";
      severity: IntegrityViolationSeverity;
      message: string;
      transferRecordId: string;
      jobId: string;
      suggestedAction?: string;
      details?: Record<string, unknown>;
    };

type ReleasedJobRow = {
  id: string;
  payoutStatus: string;
  amountCents: number;
  currency: string;
};

type EscrowRow = {
  id: string;
  jobId: string;
  kind: string;
  status: string;
  amountCents: number;
  currency: string;
  releasedAt: string | null;
};

type TransferRecordRow = {
  id: string;
  jobId: string;
  role: string;
  userId: string;
  amountCents: number;
  currency: string;
  method: string;
  status: string;
  stripeTransferId: string | null;
  externalRef: string | null;
};

type LedgerEntryRow = {
  id: string;
  userId: string;
  jobId: string | null;
  escrowId: string | null;
  type: string;
  direction: string;
  bucket: string;
  amountCents: number;
  currency: string;
  stripeRef: string | null;
};

type AuditInput = {
  releasedJobs: ReleasedJobRow[];
  escrows: EscrowRow[];
  transferRecords: TransferRecordRow[];
  ledgerEntries: LedgerEntryRow[];
  orphanTransferRecords?: Array<{ id: string; jobId: string; role: string; createdAt: string | null }>;
};

const EXPECTED_ROLES = ["CONTRACTOR", "ROUTER", "PLATFORM"] as const;
const SYSTEM_ESCROW_USER_ID = "system:escrow";

function money(n: unknown) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function normalizeUpper(s: unknown) {
  return String(s ?? "").trim().toUpperCase();
}

function findEscrowForJob(escrows: EscrowRow[], jobId: string) {
  // Only JOB_ESCROW is relevant for release integrity.
  return escrows.find((e) => String(e.jobId) === jobId && normalizeUpper(e.kind) === "JOB_ESCROW") ?? null;
}

function expectedLegLedgerSignature(leg: TransferRecordRow) {
  const role = normalizeUpper(leg.role);
  const method = normalizeUpper(leg.method);
  const bucket = role === "PLATFORM" ? "AVAILABLE" : method === "PAYPAL" ? "AVAILABLE" : "PAID";
  const type = role === "PLATFORM" ? "BROKER_FEE" : "PAYOUT";
  const stripeRef = role === "PLATFORM" ? null : method === "PAYPAL" ? leg.externalRef : leg.stripeTransferId;
  return { bucket, type, stripeRef };
}

function hasLedgerEvidenceForLeg(ledgerEntries: LedgerEntryRow[], leg: TransferRecordRow) {
  const sig = expectedLegLedgerSignature(leg);
  const jobId = String(leg.jobId);
  const userId = String(leg.userId);
  const amountCents = money(leg.amountCents);
  const currency = normalizeUpper(leg.currency);

  for (const le of ledgerEntries) {
    if (String(le.jobId ?? "") !== jobId) continue;
    if (String(le.userId ?? "") !== userId) continue;
    if (normalizeUpper(le.direction) !== "CREDIT") continue;
    if (normalizeUpper(le.type) !== sig.type) continue;
    if (normalizeUpper(le.bucket) !== sig.bucket) continue;
    if (money(le.amountCents) !== amountCents) continue;
    if (normalizeUpper(le.currency) !== currency) continue;
    if ((le.stripeRef ?? null) !== (sig.stripeRef ?? null)) continue;
    return true;
  }
  return false;
}

function hasEscrowLedgerFund(ledgerEntries: LedgerEntryRow[], escrow: EscrowRow) {
  for (const le of ledgerEntries) {
    if (String(le.jobId ?? "") !== String(escrow.jobId)) continue;
    if ((le.escrowId ?? null) !== String(escrow.id)) continue;
    if (String(le.userId ?? "") !== SYSTEM_ESCROW_USER_ID) continue;
    if (normalizeUpper(le.type) !== "ESCROW_FUND") continue;
    if (normalizeUpper(le.direction) !== "CREDIT") continue;
    if (normalizeUpper(le.bucket) !== "HELD") continue;
    if (money(le.amountCents) !== money(escrow.amountCents)) continue;
    if (normalizeUpper(le.currency) !== normalizeUpper(escrow.currency)) continue;
    return true;
  }
  return false;
}

function hasEscrowLedgerRelease(ledgerEntries: LedgerEntryRow[], escrow: EscrowRow) {
  for (const le of ledgerEntries) {
    if (String(le.jobId ?? "") !== String(escrow.jobId)) continue;
    if ((le.escrowId ?? null) !== String(escrow.id)) continue;
    if (String(le.userId ?? "") !== SYSTEM_ESCROW_USER_ID) continue;
    if (normalizeUpper(le.type) !== "ESCROW_RELEASE") continue;
    if (normalizeUpper(le.direction) !== "DEBIT") continue;
    if (normalizeUpper(le.bucket) !== "HELD") continue;
    if (money(le.amountCents) !== money(escrow.amountCents)) continue;
    if (normalizeUpper(le.currency) !== normalizeUpper(escrow.currency)) continue;
    return true;
  }
  return false;
}

export function auditPayoutIntegrity(input: AuditInput): {
  summary: {
    releasedJobsAudited: number;
    jobsWithViolations: number;
    violationCount: number;
    violationsByType: Record<string, number>;
  };
  violations: IntegrityViolation[];
} {
  const violations: IntegrityViolation[] = [];
  const applySuggestedAction = (v: IntegrityViolation): IntegrityViolation => {
    if (v.suggestedAction) return v;

    const d = (v as any).details ?? {};
    const get = (k: string) => (typeof d?.[k] === "string" ? String(d[k]) : "");
    const escrowId = get("escrowId");
    const transferRecordId = v.type === "TRANSFER_ORPHAN" ? String(v.transferRecordId) : get("transferRecordId");
    const stripeTransferId = get("stripeTransferId") || get("expectedStripeRef");

    const suggestedAction =
      v.type === "ESCROW_MISSING"
        ? "Investigate missing JOB_ESCROW row; verify release path and backfill if needed"
        : v.type === "ESCROW_STATUS_MISMATCH"
          ? `Inspect escrow row ${escrowId || "(unknown)"}; ensure status=RELEASED for RELEASED jobs`
          : v.type === "ESCROW_RELEASED_AT_MISSING"
            ? `Set Escrow.releasedAt after verifying transfers (escrowId=${escrowId || "(unknown)"})`
            : v.type === "ESCROW_RELEASED_AT_SET_BUT_STATUS_NOT_RELEASED"
              ? `Investigate escrow row ${escrowId || "(unknown)"}; releasedAt set but status not RELEASED`
              : v.type === "ESCROW_AMOUNT_MISMATCH"
                ? `Investigate escrow amount immutability (escrowId=${escrowId || "(unknown)"})`
                : v.type === "ESCROW_LEDGER_FUND_MISSING"
                  ? `Backfill/repair ESCROW_FUND ledger entry (escrowId=${escrowId || "(unknown)"})`
                  : v.type === "ESCROW_LEDGER_RELEASE_MISSING"
                    ? `Backfill/repair ESCROW_RELEASE ledger entry (escrowId=${escrowId || "(unknown)"})`
                    : v.type === "TRANSFER_LEG_COUNT_MISMATCH" || v.type === "TRANSFER_LEG_ROLE_MISSING" || v.type === "TRANSFER_LEG_DUPLICATE_ROLE"
                      ? "Investigate TransferRecord legs; verify 3-leg invariant and idempotency keys"
                      : v.type === "TRANSFER_SUM_MISMATCH"
                        ? "Investigate leg split vs escrow amount; verify no duplicate legs and correct amounts"
                        : v.type === "TRANSFER_LEG_FAILED"
                          ? `Investigate failed transfer on Stripe (transferId=${stripeTransferId || "(unknown)"}); do not retry release until resolved`
                          : v.type === "TRANSFER_LEG_STATUS_NOT_SENT"
                            ? "Investigate non-SENT leg status on a RELEASED job; ensure webhook lifecycle reconciliation is correct"
                            : v.type === "LEDGER_EVIDENCE_MISSING"
                              ? `Backfill ledger evidence for leg (transferRecordId=${transferRecordId || "(unknown)"})`
                              : v.type === "PLATFORM_LEDGER_DRIFT"
                                ? "Investigate platform broker-fee ledger duplication/missing writes; reconcile BROKER_FEE credits vs PLATFORM legs"
                                : v.type === "TRANSFER_ORPHAN"
                                  ? `Investigate orphan TransferRecord row (transferRecordId=${transferRecordId || "(unknown)"})`
                                  : undefined;

    return suggestedAction ? ({ ...v, suggestedAction } as any) : v;
  };

  const escrowsByJob = new Map<string, EscrowRow | null>();
  for (const j of input.releasedJobs) escrowsByJob.set(String(j.id), findEscrowForJob(input.escrows, String(j.id)));

  const transfersByJob = new Map<string, TransferRecordRow[]>();
  for (const t of input.transferRecords) {
    const jobId = String(t.jobId ?? "");
    if (!jobId) continue;
    const arr = transfersByJob.get(jobId) ?? [];
    arr.push(t);
    transfersByJob.set(jobId, arr);
  }

  const ledgerByJob = new Map<string, LedgerEntryRow[]>();
  for (const le of input.ledgerEntries) {
    const jobId = String(le.jobId ?? "");
    if (!jobId) continue;
    const arr = ledgerByJob.get(jobId) ?? [];
    arr.push(le);
    ledgerByJob.set(jobId, arr);
  }

  for (const job of input.releasedJobs) {
    const jobId = String(job.id);
    const escrow = escrowsByJob.get(jobId) ?? null;
    const legs = transfersByJob.get(jobId) ?? [];
    const ledger = ledgerByJob.get(jobId) ?? [];

    if (!escrow) {
      violations.push({
        type: "ESCROW_MISSING",
        severity: "HIGH",
        jobId,
        message: "Missing JOB_ESCROW row for RELEASED job",
      });
    } else {
      const escrowStatus = normalizeUpper(escrow.status);
      if (escrowStatus !== "RELEASED") {
        violations.push({
          type: "ESCROW_STATUS_MISMATCH",
          severity: "HIGH",
          jobId,
          message: `Escrow status mismatch (expected RELEASED, got ${escrowStatus || "?"})`,
          details: { escrowId: escrow.id, status: escrowStatus || null },
        });
      }

      const releasedAt = escrow.releasedAt ? String(escrow.releasedAt) : null;
      if (escrowStatus === "RELEASED" && !releasedAt) {
        violations.push({
          type: "ESCROW_RELEASED_AT_MISSING",
          severity: "HIGH",
          jobId,
          message: "Escrow is RELEASED but releasedAt is null",
          details: { escrowId: escrow.id },
        });
      } else if (escrowStatus !== "RELEASED" && releasedAt) {
        violations.push({
          type: "ESCROW_RELEASED_AT_SET_BUT_STATUS_NOT_RELEASED",
          severity: "HIGH",
          jobId,
          message: "Escrow releasedAt is set but status is not RELEASED",
          details: { escrowId: escrow.id, status: escrowStatus || null, releasedAt },
        });
      }

      if (money(escrow.amountCents) !== money(job.amountCents)) {
        violations.push({
          type: "ESCROW_AMOUNT_MISMATCH",
          severity: "HIGH",
          jobId,
          message: "Escrow amount does not match job amountCents",
          details: { escrowId: escrow.id, escrowAmountCents: money(escrow.amountCents), jobAmountCents: money(job.amountCents) },
        });
      }

      // Escrow ledger evidence: fund + release should exist for released jobs.
      if (!hasEscrowLedgerFund(input.ledgerEntries, escrow)) {
        violations.push({
          type: "ESCROW_LEDGER_FUND_MISSING",
          severity: "HIGH",
          jobId,
          message: "Missing ESCROW_FUND ledger entry for released escrow",
          details: { escrowId: escrow.id },
        });
      }
      if (!hasEscrowLedgerRelease(input.ledgerEntries, escrow)) {
        violations.push({
          type: "ESCROW_LEDGER_RELEASE_MISSING",
          severity: "HIGH",
          jobId,
          message: "Missing ESCROW_RELEASE ledger entry for released escrow",
          details: { escrowId: escrow.id },
        });
      }
    }

    if (legs.length !== 3) {
      violations.push({
        type: "TRANSFER_LEG_COUNT_MISMATCH",
        severity: "HIGH",
        jobId,
        message: `Transfer leg count mismatch (expected 3, got ${legs.length})`,
        details: { legIds: legs.map((l) => l.id) },
      });
    }

    const rolesSeen = new Map<string, number>();
    for (const l of legs) rolesSeen.set(normalizeUpper(l.role), (rolesSeen.get(normalizeUpper(l.role)) ?? 0) + 1);

    for (const role of EXPECTED_ROLES) {
      const count = rolesSeen.get(role) ?? 0;
      if (count === 0) {
        violations.push({
          type: "TRANSFER_LEG_ROLE_MISSING",
          severity: "HIGH",
          jobId,
          message: `Missing transfer leg role ${role}`,
        });
      } else if (count > 1) {
        violations.push({
          type: "TRANSFER_LEG_DUPLICATE_ROLE",
          severity: "HIGH",
          jobId,
          message: `Duplicate transfer legs for role ${role}`,
          details: { role, count },
        });
      }
    }

    const sum = legs.reduce((acc, l) => acc + money(l.amountCents), 0);
    const escrowAmount = escrow ? money(escrow.amountCents) : null;
    if (escrowAmount != null && sum !== escrowAmount) {
      violations.push({
        type: "TRANSFER_SUM_MISMATCH",
        severity: "HIGH",
        jobId,
        message: "Sum(transfer legs) does not equal escrow amount",
        details: { legsSumCents: sum, escrowAmountCents: escrowAmount },
      });
    }

    const failed = legs.filter((l) => normalizeUpper(l.status) === "FAILED");
    for (const f of failed) {
      violations.push({
        type: "TRANSFER_LEG_FAILED",
        severity: "HIGH",
        jobId,
        message: "Transfer leg is FAILED (escalate)",
        details: { transferRecordId: f.id, role: normalizeUpper(f.role), stripeTransferId: f.stripeTransferId, externalRef: f.externalRef },
      });
    }

    const notSent = legs.filter((l) => normalizeUpper(l.status) !== "SENT");
    if (notSent.length) {
      violations.push({
        type: "TRANSFER_LEG_STATUS_NOT_SENT",
        severity: "HIGH",
        jobId,
        message: "RELEASED job has non-SENT transfer leg(s)",
        details: {
          legs: notSent.map((l) => ({ id: l.id, role: normalizeUpper(l.role), status: normalizeUpper(l.status) })),
        },
      });
    }

    // Ledger evidence: ensure each leg has a matching entry (release engine requirement).
    for (const leg of legs) {
      if (!hasLedgerEvidenceForLeg(ledger, leg)) {
        const ref = normalizeUpper(leg.role) === "PLATFORM" ? null : normalizeUpper(leg.method) === "PAYPAL" ? leg.externalRef : leg.stripeTransferId;
        violations.push({
          type: "LEDGER_EVIDENCE_MISSING",
          severity: "HIGH",
          jobId,
          message: "Missing ledger entry for transfer leg",
          details: {
            transferRecordId: leg.id,
            role: normalizeUpper(leg.role),
            userId: leg.userId,
            amountCents: money(leg.amountCents),
            currency: normalizeUpper(leg.currency),
            method: normalizeUpper(leg.method),
            expectedStripeRef: ref,
          },
        });
      }
    }
  }

  // Aggregate drift check: protect against duplicates/partial writes beyond per-leg existence checks.
  const jobIdSet = new Set(input.releasedJobs.map((j) => String(j.id)));
  const platformExpectedCents = input.transferRecords
    .filter((t) => jobIdSet.has(String(t.jobId)) && normalizeUpper(t.role) === "PLATFORM")
    .reduce((acc, t) => acc + money(t.amountCents), 0);
  const platformLedgerCents = input.ledgerEntries
    .filter(
      (le) =>
        jobIdSet.has(String(le.jobId ?? "")) &&
        normalizeUpper(le.type) === "BROKER_FEE" &&
        normalizeUpper(le.direction) === "CREDIT" &&
        normalizeUpper(le.bucket) === "AVAILABLE",
    )
    .reduce((acc, le) => acc + money(le.amountCents), 0);
  const platformDiffCents = Math.abs(platformExpectedCents - platformLedgerCents);
  const DRIFT_THRESHOLD_CENTS = 100;
  if (platformDiffCents > DRIFT_THRESHOLD_CENTS) {
    violations.push({
      type: "PLATFORM_LEDGER_DRIFT",
      severity: "CRITICAL",
      jobId: "aggregate",
      message: "Platform broker-fee ledger drift exceeds threshold",
      details: {
        platformExpectedCents,
        platformLedgerCents,
        diffCents: platformExpectedCents - platformLedgerCents,
        absDiffCents: platformDiffCents,
        thresholdCents: DRIFT_THRESHOLD_CENTS,
      },
    });
  }

  // Orphan transfer records (optional; computed by the endpoint to avoid scanning in pure tests).
  for (const o of input.orphanTransferRecords ?? []) {
    violations.push({
      type: "TRANSFER_ORPHAN",
      severity: "WARN",
      transferRecordId: String(o.id),
      jobId: String(o.jobId),
      message: "TransferRecord references missing Job",
      details: { role: String(o.role ?? ""), createdAt: o.createdAt ?? null },
    });
  }

  // Deterministic ordering (CI-safe logs).
  const rank: Record<IntegrityViolationSeverity, number> = { CRITICAL: 0, HIGH: 1, WARN: 2 };
  const getTransferId = (v: IntegrityViolation) => {
    if (v.type === "TRANSFER_ORPHAN") return String(v.transferRecordId ?? "");
    const d = (v.details ?? {}) as Record<string, unknown>;
    const id = d.transferRecordId;
    return typeof id === "string" ? id : "";
  };
  violations.sort((a, b) => {
    const ra = rank[a.severity] ?? 99;
    const rb = rank[b.severity] ?? 99;
    if (ra !== rb) return ra - rb;
    const ta = String(a.type ?? "");
    const tb = String(b.type ?? "");
    if (ta !== tb) return ta.localeCompare(tb);
    const ja = String(a.jobId ?? "");
    const jb = String(b.jobId ?? "");
    if (ja !== jb) return ja.localeCompare(jb);
    const ida = getTransferId(a);
    const idb = getTransferId(b);
    return ida.localeCompare(idb);
  });

  const violationsByType: Record<string, number> = {};
  const jobsWithViolations = new Set<string>();
  for (const v of violations) {
    violationsByType[v.type] = (violationsByType[v.type] ?? 0) + 1;
    jobsWithViolations.add(v.jobId);
  }

  const withSuggestions = violations.map(applySuggestedAction);
  return {
    summary: {
      releasedJobsAudited: input.releasedJobs.length,
      jobsWithViolations: jobsWithViolations.size,
      violationCount: withSuggestions.length,
      violationsByType,
    },
    violations: withSuggestions,
  };
}

