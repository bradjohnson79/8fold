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

export function classifyJobPosterRouteError(err: unknown): { errorType: JobPosterRouteErrorType; status: number } {
  const statusRaw = (err as any)?.status;
  const status =
    typeof statusRaw === "number" && Number.isFinite(statusRaw)
      ? statusRaw
      : typeof (err as any)?.cause?.status === "number"
        ? (err as any).cause.status
        : 500;

  // Auth
  if (status === 401 || status === 403) return { errorType: "AUTH_ERROR", status: 401 };

  // Validation
  if (status === 400 || status === 422) return { errorType: "VALIDATION_ERROR", status: 400 };

  // DB (Postgres / Drizzle / pg)
  const anyErr: any = err && typeof err === "object" ? (err as any) : null;
  const pgCode =
    typeof anyErr?.code === "string"
      ? anyErr.code
      : typeof anyErr?.cause?.code === "string"
        ? anyErr.cause.code
        : null;
  if (pgCode) return { errorType: "DB_ERROR", status: 500 };

  // Default
  return { errorType: "INTERNAL_ERROR", status: status >= 400 && status < 600 ? status : 500 };
}

export function jobPosterRouteErrorResponse(args: {
  route: string;
  errorType: JobPosterRouteErrorType;
  status: number;
  err: unknown;
  userId?: string | null;
  jobId?: string | null;
  extraJson?: Record<string, unknown>;
}) {
  console.error({
    route: args.route,
    errorType: args.errorType,
    message: getErrMessage(args.err),
    stack: getErrStack(args.err),
    userId: args.userId ?? null,
    jobId: args.jobId ?? null,
  });

  return NextResponse.json(
    {
      error: USER_MESSAGE[args.errorType],
      ...(args.extraJson ?? {}),
    },
    { status: args.status }
  );
}

export function jobPosterRouteErrorFromUnknown(args: {
  route: string;
  err: unknown;
  userId?: string | null;
  jobId?: string | null;
  extraJson?: Record<string, unknown>;
}) {
  const classified = classifyJobPosterRouteError(args.err);
  return jobPosterRouteErrorResponse({
    route: args.route,
    err: args.err,
    errorType: classified.errorType,
    status: classified.status,
    userId: args.userId,
    jobId: args.jobId,
    extraJson: args.extraJson,
  });
}

