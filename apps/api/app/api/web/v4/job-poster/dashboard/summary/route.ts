import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getJobPosterSummary } from "@/src/services/v4/jobPosterSummaryService";
import { getJobPosterPaymentStatus } from "@/src/services/v4/jobPosterPaymentService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const logger = {
  error(message: string, meta: Record<string, unknown>) {
    console.error(message, meta);
  },
};

const FALLBACK_ERROR = "Partial failure, please retry";

export async function GET(req: Request) {
  let requestId: string | undefined;
  let userId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    userId = role.userId;
    const summary = await getJobPosterSummary(role.userId);
    return NextResponse.json(summary);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    logger.error("job-poster dashboard summary error", {
      error: err instanceof Error ? err.message : String(err),
      userId,
      requestId,
      status,
    });

    if (status === 401 || status === 403) {
      const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SUMMARY_FAILED");
      return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
    }

    let fallbackPaymentStatus: "CONNECTED" | "NOT_CONNECTED" = "NOT_CONNECTED";
    if (userId) {
      try {
        const payment = await getJobPosterPaymentStatus(userId);
        fallbackPaymentStatus = payment.connected ? "CONNECTED" : "NOT_CONNECTED";
      } catch (paymentErr) {
        logger.error("job-poster payment status mismatch", {
          error: paymentErr instanceof Error ? paymentErr.message : String(paymentErr),
          userId,
          summaryStatus: null,
          paymentStatus: null,
        });
      }
    }

    return NextResponse.json(
      {
        jobsPosted: 0,
        fundsSecured: 0,
        paymentStatus: fallbackPaymentStatus,
        unreadMessages: 0,
        activeAssignments: 0,
        error: FALLBACK_ERROR,
      },
      { status: 200 },
    );
  }
}
