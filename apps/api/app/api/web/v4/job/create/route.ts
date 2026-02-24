import { NextResponse } from "next/server";
import { createV4Job, V4JobCreateBodySchema } from "@/src/services/v4/jobCreateService";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";

export async function POST(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    const roleCheck = await requireRole(req, "JOB_POSTER");
    if (roleCheck instanceof Response) return roleCheck;

    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobCreateBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request body";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    return NextResponse.json(await createV4Job(parsed.data, roleCheck.internalUser.id));
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Job create failed." },
      { status },
    );
  }
}
