import {
  assertAllowedTransition,
  JobAllowedTransitions,
  type JobStatus
} from "@8fold/shared";

export function assertJobTransition(from: JobStatus, to: JobStatus) {
  assertAllowedTransition("Job", from, to, JobAllowedTransitions);
}

