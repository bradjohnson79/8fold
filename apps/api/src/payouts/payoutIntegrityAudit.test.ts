import { describe, expect, it } from "vitest";
import { auditPayoutIntegrity } from "./payoutIntegrityAudit";

function baseReleasedJob() {
  return { id: "job_1", payoutStatus: "RELEASED", amountCents: 10000, currency: "USD" };
}

function baseEscrow() {
  return {
    id: "esc_1",
    jobId: "job_1",
    kind: "JOB_ESCROW",
    status: "RELEASED",
    amountCents: 10000,
    currency: "USD",
    releasedAt: "2026-01-01T00:00:00.000Z",
  };
}

function baseLegs() {
  return [
    {
      id: "tr_c",
      jobId: "job_1",
      role: "CONTRACTOR",
      userId: "u_c",
      amountCents: 7500,
      currency: "USD",
      method: "STRIPE",
      status: "SENT",
      stripeTransferId: "trf_c",
      externalRef: null,
    },
    {
      id: "tr_r",
      jobId: "job_1",
      role: "ROUTER",
      userId: "u_r",
      amountCents: 1500,
      currency: "USD",
      method: "STRIPE",
      status: "SENT",
      stripeTransferId: "trf_r",
      externalRef: null,
    },
    {
      id: "tr_p",
      jobId: "job_1",
      role: "PLATFORM",
      userId: "u_platform",
      amountCents: 1000,
      currency: "USD",
      method: "STRIPE",
      status: "SENT",
      stripeTransferId: null,
      externalRef: null,
    },
  ];
}

function baseLedger() {
  return [
    // Escrow fund/release (system:escrow)
    {
      id: "le_fund",
      userId: "system:escrow",
      jobId: "job_1",
      escrowId: "esc_1",
      type: "ESCROW_FUND",
      direction: "CREDIT",
      bucket: "HELD",
      amountCents: 10000,
      currency: "USD",
      stripeRef: "pi_123",
    },
    {
      id: "le_rel",
      userId: "system:escrow",
      jobId: "job_1",
      escrowId: "esc_1",
      type: "ESCROW_RELEASE",
      direction: "DEBIT",
      bucket: "HELD",
      amountCents: 10000,
      currency: "USD",
      stripeRef: "release:job_1",
    },
    // Leg evidence
    {
      id: "le_c",
      userId: "u_c",
      jobId: "job_1",
      escrowId: null,
      type: "PAYOUT",
      direction: "CREDIT",
      bucket: "PAID",
      amountCents: 7500,
      currency: "USD",
      stripeRef: "trf_c",
    },
    {
      id: "le_r",
      userId: "u_r",
      jobId: "job_1",
      escrowId: null,
      type: "PAYOUT",
      direction: "CREDIT",
      bucket: "PAID",
      amountCents: 1500,
      currency: "USD",
      stripeRef: "trf_r",
    },
    {
      id: "le_p",
      userId: "u_platform",
      jobId: "job_1",
      escrowId: null,
      type: "BROKER_FEE",
      direction: "CREDIT",
      bucket: "AVAILABLE",
      amountCents: 1000,
      currency: "USD",
      stripeRef: null,
    },
  ];
}

describe("auditPayoutIntegrity", () => {
  it("passes a clean RELEASED job snapshot", () => {
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: baseLegs(),
      ledgerEntries: baseLedger(),
    });
    expect(out.summary.violationCount).toBe(0);
  });

  it("detects a missing leg", () => {
    const legs = baseLegs().filter((l) => l.role !== "ROUTER");
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: legs,
      ledgerEntries: baseLedger(),
    });
    expect(out.violations.some((v) => v.type === "TRANSFER_LEG_COUNT_MISMATCH")).toBe(true);
    expect(out.violations.some((v) => v.type === "TRANSFER_LEG_ROLE_MISSING")).toBe(true);
  });

  it("detects overpayment (sum legs > escrow)", () => {
    const legs = baseLegs().map((l) => (l.role === "PLATFORM" ? { ...l, amountCents: 2000 } : l));
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: legs,
      ledgerEntries: baseLedger().map((le) => (le.id === "le_p" ? { ...le, amountCents: 2000 } : le)),
    });
    expect(out.violations.some((v) => v.type === "TRANSFER_SUM_MISMATCH")).toBe(true);
  });

  it("detects missing ledger evidence for a leg", () => {
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: baseLegs(),
      ledgerEntries: baseLedger().filter((le) => le.id !== "le_r"),
    });
    expect(out.violations.some((v) => v.type === "LEDGER_EVIDENCE_MISSING")).toBe(true);
  });

  it("detects platform broker-fee ledger drift (CRITICAL)", () => {
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: baseLegs(),
      ledgerEntries: [
        ...baseLedger(),
        {
          id: "le_p_dup",
          userId: "u_platform",
          jobId: "job_1",
          escrowId: null,
          type: "BROKER_FEE",
          direction: "CREDIT",
          bucket: "AVAILABLE",
          amountCents: 1000,
          currency: "USD",
          stripeRef: null,
        },
      ],
    });
    expect(out.violations.some((v) => v.type === "PLATFORM_LEDGER_DRIFT" && v.severity === "CRITICAL")).toBe(true);
  });

  it("escalates FAILED leg on RELEASED job (HIGH)", () => {
    const legs = baseLegs().map((l) => (l.role === "ROUTER" ? { ...l, status: "FAILED" as const } : l));
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [baseEscrow()],
      transferRecords: legs as any,
      ledgerEntries: baseLedger(),
    });
    expect(out.violations.some((v) => v.type === "TRANSFER_LEG_FAILED" && v.severity === "HIGH")).toBe(true);
    expect(out.violations.some((v) => v.type === "TRANSFER_LEG_STATUS_NOT_SENT" && v.severity === "HIGH")).toBe(true);
  });

  it("flags RELEASED escrow missing releasedAt (HIGH)", () => {
    const out = auditPayoutIntegrity({
      releasedJobs: [baseReleasedJob()],
      escrows: [{ ...baseEscrow(), releasedAt: null }],
      transferRecords: baseLegs(),
      ledgerEntries: baseLedger(),
    });
    expect(out.violations.some((v) => v.type === "ESCROW_RELEASED_AT_MISSING" && v.severity === "HIGH")).toBe(true);
  });
});

