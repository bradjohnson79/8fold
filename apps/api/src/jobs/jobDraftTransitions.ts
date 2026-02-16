import {
  assertAllowedTransition,
  JobDraftAllowedTransitions,
  type JobDraftStatus
} from "@8fold/shared";

export function assertJobDraftTransition(from: JobDraftStatus, to: JobDraftStatus) {
  assertAllowedTransition("JobDraft", from, to, JobDraftAllowedTransitions);
}

