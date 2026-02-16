import { NextResponse } from "next/server";

export type JobPosterRouteErrorType =
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "AI_APPRAISAL_ERROR"
  | "DB_ERROR"
  | "INTERNAL_ERROR";

const USER_MESSAGE: Record<JobPosterRouteErrorType, string> = {
  AUTH_ERROR: "You must be logged in to continue.",
  VALIDATION_ERROR: "Some required job details are missing. Please review and try again.",
  AI_APPRAISAL_ERROR:
    "Sorry, our automated appraisal system is temporarily unavailable.\nWe will hand your appraisal over to our Admin team and message you shortly.",
  DB_ERROR: "We ran into a system issue while saving your job.\nYour draft has been preserved.",
  INTERNAL_ERROR: "Something went wrong. Please try again shortly.",
};

function getErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function getErrStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

export function jobPosterRouteErrorResponse(args: {
  route: string;
  errorType: JobPosterRouteErrorType;
  status: number;
  err: unknown;
  userId?: string | null;
  jobId?: string | null;
}) {
  // Production-readiness freeze: no ad-hoc console diagnostics from request handlers.
  // If you later wire a real observability sink (Sentry/Datadog), capture:
  // - route, errorType, message, stack, userId, jobId
  void args;
  void getErrMessage;
  void getErrStack;

  return NextResponse.json({ ok: false, error: USER_MESSAGE[args.errorType], code: args.errorType }, { status: args.status });
}

