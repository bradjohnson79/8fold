import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getScoreAppraisalForUser } from "@/src/services/v4/scoreAppraisalService";

export async function GET(req: Request) {
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
}
