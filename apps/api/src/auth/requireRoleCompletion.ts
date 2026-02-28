import { NextResponse } from "next/server";
import {
  getRoleCompletion,
  type CompletionStep,
} from "@/src/services/v4/roleCompletionService";
import type { CompletionRole } from "@/src/services/v4/roleTermsService";

function accountIncompleteBody(missing: CompletionStep[]) {
  return {
    ok: false as const,
    error: {
      code: "ACCOUNT_INCOMPLETE",
      message: "Account setup incomplete.",
      details: { missing },
    },
  };
}

export function toAccountIncompleteResponse(missing: CompletionStep[]) {
  return NextResponse.json(accountIncompleteBody(missing), { status: 403 });
}

export async function requireRoleCompletion(
  userId: string,
  role: CompletionRole,
): Promise<Response | null> {
  const completion = await getRoleCompletion(userId, role);
  if (completion?.complete) {
    return null;
  }

  const missing = completion?.missing ?? (["TERMS", "PROFILE", "PAYMENT"] as CompletionStep[]);
  return toAccountIncompleteResponse(missing);
}
