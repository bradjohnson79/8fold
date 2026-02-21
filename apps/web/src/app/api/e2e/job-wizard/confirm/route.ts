import { NextResponse } from "next/server";
import {
  getE2EUserIdFromHeader,
  getOrCreateState,
  invalidE2EIdentityResponse,
  isE2ETestModeEnabled,
  modeDisabledResponse,
  traceId,
  verifyPayment,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  if (!isE2ETestModeEnabled()) return modeDisabledResponse();
  const userId = getE2EUserIdFromHeader(req);
  if (!userId) return invalidE2EIdentityResponse();
  const state = getOrCreateState(userId);
  const paymentIntentId = state.draft.paymentIntentId ?? `pi_${state.draft.id}`;
  const result = verifyPayment(state, paymentIntentId);
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({
    success: true,
    idempotent: true,
    traceId: traceId(),
  });
}
