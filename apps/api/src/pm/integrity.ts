export function buildPmPiIdempotencyKey(pmRequestId: string): string {
  return `pm:${pmRequestId}:pi`;
}

export function buildPmPiMetadata(input: {
  pmRequestId: string;
  jobId: string;
  posterId: string;
  contractorId: string;
}): Record<string, string> {
  return {
    type: "pm_escrow",
    pmRequestId: input.pmRequestId,
    jobId: input.jobId,
    posterId: input.posterId,
    contractorId: input.contractorId,
    // Keep legacy key for compatibility with existing webhook parsing.
    jobPosterUserId: input.posterId,
  };
}
