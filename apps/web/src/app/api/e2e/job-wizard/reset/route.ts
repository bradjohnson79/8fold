import { NextResponse } from "next/server";
import {
  getE2EUserIdFromHeader,
  isE2ETestModeEnabled,
  modeDisabledResponse,
  invalidE2EIdentityResponse,
  resetState,
  traceId,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  if (!isE2ETestModeEnabled()) return modeDisabledResponse();
  const userId = getE2EUserIdFromHeader(req);
  if (!userId) return invalidE2EIdentityResponse();
  resetState(userId);
  return NextResponse.json({
    success: true,
    instructions: {
      clearClientLocalStorage: true,
      clearClientCookies: true,
    },
    traceId: traceId(),
  });
}
