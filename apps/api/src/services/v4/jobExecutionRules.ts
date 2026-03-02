export type ExecutionJobRow = {
  id: string;
  status: string | null;
  appointment_at: Date | null;
  completed_at: Date | null;
  contractor_marked_complete_at: Date | null;
  poster_marked_complete_at: Date | null;
};

export type ExecutionEligibility = {
  appointmentReached: boolean;
  completed: boolean;
  canMarkComplete: boolean;
  executionStatus: "NOT_STARTED" | "READY" | "AWAITING_COUNTERPARTY" | "COMPLETED";
};

export function normalizeExecutionStatus(status: unknown): string {
  return String(status ?? "").toUpperCase();
}

export function shouldAutoTransitionToJobStarted(status: unknown, appointmentAt: Date | null, now = new Date()): boolean {
  return normalizeExecutionStatus(status) === "PUBLISHED" && appointmentAt instanceof Date && now.getTime() >= appointmentAt.getTime();
}

export function computeExecutionEligibility(job: ExecutionJobRow, now = new Date()): ExecutionEligibility {
  const status = normalizeExecutionStatus(job.status);
  const appointmentReached = job.appointment_at instanceof Date && now.getTime() >= job.appointment_at.getTime();
  const completed = Boolean(job.completed_at) || ["COMPLETED", "COMPLETED_APPROVED"].includes(status);
  const markableStatuses = new Set(["JOB_STARTED", "IN_PROGRESS"]);
  const canMarkComplete = appointmentReached && !completed && markableStatuses.has(status);

  if (completed) {
    return { appointmentReached, completed: true, canMarkComplete: false, executionStatus: "COMPLETED" };
  }
  if (job.contractor_marked_complete_at || job.poster_marked_complete_at) {
    return { appointmentReached, completed: false, canMarkComplete, executionStatus: "AWAITING_COUNTERPARTY" };
  }
  if (canMarkComplete) {
    return { appointmentReached, completed: false, canMarkComplete: true, executionStatus: "READY" };
  }
  return { appointmentReached, completed: false, canMarkComplete: false, executionStatus: "NOT_STARTED" };
}

export function mapLegacyStatusForExecution(statusRaw: string | null): string {
  const status = normalizeExecutionStatus(statusRaw);
  if (status === "IN_PROGRESS") return "JOB_STARTED";
  return status;
}

export function isExecutionFinalStatus(statusRaw: string | null): boolean {
  return ["COMPLETED", "COMPLETED_APPROVED"].includes(normalizeExecutionStatus(statusRaw));
}
