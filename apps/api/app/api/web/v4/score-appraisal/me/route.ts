import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getScoreAppraisalForUser } from "@/src/services/v4/scoreAppraisalService";

export async function GET(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    const user = authed.internalUser;
    if (!user?.id) return NextResponse.json({ ok: false, error: "User not found" }, { status: 403 });

    const role = String(user.role ?? "").toUpperCase();
    if (role !== "CONTRACTOR" && role !== "JOB_POSTER") {
      return NextResponse.json({ ok: false, error: "Role not eligible for score appraisal" }, { status: 403 });
    }

    const scoreRole = role === "CONTRACTOR" ? "CONTRACTOR" : "POSTER";
    const appraisal = await getScoreAppraisalForUser(user.id, scoreRole);
    return NextResponse.json({ ok: true, appraisal });
  } catch (err) {
    const dbErr = err as any;
    console.error("SCORE_APPRAISAL_ME_FAILED", {
      code: dbErr?.code,
      detail: dbErr?.detail,
      constraint: dbErr?.constraint,
      table: dbErr?.table,
      message: err instanceof Error ? err.message : String(err),
    });
    // Dashboard-safe fallback: avoid hard-failing overview page when score tables/migrations lag.
    return NextResponse.json(
      { ok: true, appraisal: { pending: true, jobsEvaluated: 0, minimumRequired: 3 } },
      { status: 200 },
    );
  }
}
