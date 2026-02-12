import type { JobSource, PublicJobStatus } from "../types/dbEnums";

/**
 * Enforcement rules for jobSource consistency:
 * - jobSource = 'MOCK' → isMock = true, publicStatus = 'IN_PROGRESS'
 * - jobSource = 'AI_REGENERATED' → isMock = true, publicStatus = 'IN_PROGRESS'
 * - jobSource = 'REAL' → isMock = false
 * - A job may never be: jobSource in ('MOCK','AI_REGENERATED') AND publicStatus = 'OPEN'
 */

export function enforceJobSourceConsistency(data: {
  jobSource?: JobSource;
  isMock?: boolean;
  publicStatus?: PublicJobStatus;
}): {
  isMock: boolean;
  publicStatus: PublicJobStatus;
  jobSource: JobSource;
} {
  let jobSource: JobSource = data.jobSource ?? "REAL";
  let isMock: boolean = data.isMock ?? false;
  let publicStatus: PublicJobStatus = data.publicStatus ?? "OPEN";

  // Rule 1: If jobSource is MOCK/AI_REGENERATED, enforce isMock=true and publicStatus=IN_PROGRESS
  if (jobSource === "MOCK" || jobSource === "AI_REGENERATED") {
    isMock = true;
    if (publicStatus === "OPEN") {
      publicStatus = "IN_PROGRESS";
    }
  }

  // Rule 2: If jobSource is REAL, enforce isMock=false
  if (jobSource === "REAL") {
    isMock = false;
  }

  // Rule 3: If isMock=true but jobSource not set, infer MOCK
  if (isMock && !data.jobSource) {
    jobSource = "MOCK";
    if (publicStatus === "OPEN") {
      publicStatus = "IN_PROGRESS";
    }
  }

  // Rule 4: If isMock=false but jobSource not set, infer REAL
  if (!isMock && !data.jobSource) {
    jobSource = "REAL";
  }

  return { jobSource, isMock, publicStatus };
}

/**
 * Prepare job creation data with enforced consistency.
 * Use this helper when creating jobs to ensure rules are followed.
 */
export function prepareJobDataWithSource<T extends Record<string, any>>(
  data: T & {
    jobSource?: JobSource;
    isMock?: boolean;
    publicStatus?: PublicJobStatus;
  },
): T & { jobSource: JobSource; isMock: boolean; publicStatus: PublicJobStatus } {
  const enforced = enforceJobSourceConsistency({
    jobSource: data.jobSource,
    isMock: data.isMock,
    publicStatus: data.publicStatus
  });

  return {
    ...data,
    jobSource: enforced.jobSource,
    isMock: enforced.isMock,
    publicStatus: enforced.publicStatus
  };
}
