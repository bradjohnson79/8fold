import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { computeV4JobAppraisal, V4JobAppraiseBodySchema } from "@/src/services/v4/jobAppraisalService";

export async function POST(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    const roleCheck = await requireRole(req, "JOB_POSTER");
    if (roleCheck instanceof Response) return roleCheck;

    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobAppraiseBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json(computeV4JobAppraisal(parsed.data, roleCheck.internalUser.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Appraisal preview failed." },
      { status: 500 },
    );
  }
}
