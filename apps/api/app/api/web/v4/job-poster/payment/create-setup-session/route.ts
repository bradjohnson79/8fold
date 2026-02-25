import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { createJobPosterSetupSession } from "@/src/services/v4/jobPosterPaymentService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  // Stripe runtime env diagnosis (inspection only)
  // eslint-disable-next-line no-console
  console.log("Project context check:");
  // eslint-disable-next-line no-console
  console.log("process.cwd():", process.cwd());
  // eslint-disable-next-line no-console
  console.log("STRIPE_SECRET_KEY exists:", !!process.env.STRIPE_SECRET_KEY);
  // eslint-disable-next-line no-console
  console.log("All env keys available:", Object.keys(process.env).filter((k) => k.includes("STRIPE")));

  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const { url } = await createJobPosterSetupSession(role.userId);
    return NextResponse.json({ url });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CREATE_SETUP_SESSION_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
