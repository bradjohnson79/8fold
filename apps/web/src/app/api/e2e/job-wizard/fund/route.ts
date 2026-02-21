import { NextResponse } from "next/server";
import {
  createPaymentIntent,
  getE2EUserIdFromHeader,
  getOrCreateState,
  invalidE2EIdentityResponse,
  isE2ETestModeEnabled,
  modeDisabledResponse,
  traceId,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  if (!isE2ETestModeEnabled()) return modeDisabledResponse();
  const userId = getE2EUserIdFromHeader(req);
  if (!userId) return invalidE2EIdentityResponse();
  const state = getOrCreateState(userId);
  const result = createPaymentIntent(state, { expectedVersion: state.draft.version });
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({
    success: true,
    paymentIntentId: state.draft.paymentIntentId,
    clientSecret: result.body.clientSecret,
    amount: result.body.amount,
    currency: result.body.currency,
    traceId: traceId(),
  });
}
