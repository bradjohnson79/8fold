import { auditPayoutIntegrity } from "./payoutIntegrityAudit";
import { loadPayoutIntegritySnapshotFromDb } from "./payoutIntegritySnapshot";

export async function runPayoutIntegrityAuditFromDb(input: {
  take: number;
  orphanDays: number;
}): Promise<ReturnType<typeof auditPayoutIntegrity>> {
  const snap = await loadPayoutIntegritySnapshotFromDb({ take: input.take, orphanDays: input.orphanDays });
  return auditPayoutIntegrity({
    releasedJobs: snap.releasedJobs.map((j) => ({
      id: j.id,
      payoutStatus: j.payoutStatus,
      amountCents: j.amountCents,
      currency: j.currency,
    })),
    escrows: snap.escrows.map((e) => ({
      id: e.id,
      jobId: e.jobId,
      kind: e.kind,
      status: e.status,
      amountCents: e.amountCents,
      currency: e.currency,
      releasedAt: e.releasedAt,
    })),
    transferRecords: snap.transferRecords,
    ledgerEntries: snap.ledgerEntries,
    orphanTransferRecords: snap.orphanTransferRecords,
  });
}

