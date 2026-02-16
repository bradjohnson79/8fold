export type CompletionReadyLike = {
  contractorCompletedAt?: unknown;
  customerApprovedAt?: unknown;
  routerApprovedAt?: unknown;
};

export function isCompletionReady(job: CompletionReadyLike): boolean {
  return Boolean(job.contractorCompletedAt && job.customerApprovedAt && job.routerApprovedAt);
}

