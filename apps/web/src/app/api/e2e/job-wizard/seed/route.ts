import { NextResponse } from "next/server";
import {
  getE2EUserIdFromHeader,
  invalidE2EIdentityResponse,
  isE2ETestModeEnabled,
  modeDisabledResponse,
  seedPricingReady,
  traceId,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  if (!isE2ETestModeEnabled()) return modeDisabledResponse();
  const userId = getE2EUserIdFromHeader(req);
  if (!userId) return invalidE2EIdentityResponse();
  const state = seedPricingReady(userId);
  return NextResponse.json({
    success: true,
    draft: state.draft,
    traceId: traceId(),
  });
}
