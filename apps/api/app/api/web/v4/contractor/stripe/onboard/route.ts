import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { createOrRefreshContractorOnboardingLink } from "@/src/services/v4/contractorStripeService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;

    requestId = ctx.requestId;
    const result = await createOrRefreshContractorOnboardingLink(ctx.internalUser.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("V4_CONTRACTOR_STRIPE_ONBOARD_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CONTRACTOR_STRIPE_ONBOARD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
