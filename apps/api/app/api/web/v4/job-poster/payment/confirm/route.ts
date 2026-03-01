import { NextResponse } from "next/server";
import { z } from "zod";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getJobPosterPaymentConfirm } from "@/src/services/v4/jobPosterPaymentConfirmService";

const BodySchema = z.object({
  jobId: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "V4_INVALID_REQUEST_BODY", message: "Invalid input" } }, { status: 400 });
  }

  try {
    const breakdown = await getJobPosterPaymentConfirm(role.userId, parsed.data.jobId);
    return NextResponse.json(breakdown, { status: 200 });
  } catch (err: any) {
    const status = Number(err?.status ?? 400);
    const safeStatus = status === 401 ? 401 : 400;
    return NextResponse.json(
      { ok: false, error: { code: String(err?.code ?? "V4_PAYMENT_CONFIRM_FAILED"), message: String(err?.message ?? "Failed to confirm payment") } },
      { status: safeStatus },
    );
  }
}
