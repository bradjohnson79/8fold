import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getRoleCompletion } from "@/src/services/v4/roleCompletionService";
import { toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export type RouterSessionState = "TERMS_REQUIRED" | "PROFILE_REQUIRED" | "READY";

export type RouterSessionData = {
  hasAcceptedTerms: boolean;
  profileComplete: boolean;
  missingFields: string[];
  state: RouterSessionState;
};

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const completion = await getRoleCompletion(authed.userId, "ROUTER");
    const terms = completion?.terms ?? false;
    const profile = completion?.profile ?? false;
    const missing = completion?.missing ?? [];
    const missingFields = missing.map((m) => m.toLowerCase());

    const state: RouterSessionState = !terms ? "TERMS_REQUIRED" : !profile ? "PROFILE_REQUIRED" : "READY";

    const data: RouterSessionData = {
      hasAcceptedTerms: terms,
      profileComplete: profile,
      missingFields,
      state,
    };

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : { status: 500, code: "V4_SESSION_FAILED", message: "Failed to load session" };
    return NextResponse.json(toV4ErrorResponse(wrapped as V4Error, requestId), { status: (wrapped as V4Error).status });
  }
}
