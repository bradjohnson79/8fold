import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { finalizeJob } from "@/src/services/v4/jobFinalizeService";

const FinalizeBodySchema = z.object({
  details: z.object({
    title: z.string(),
    description: z.string(),
    tradeCategory: z.string(),
    stateCode: z.string().optional(),
    countryCode: z.string().optional(),
    region: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    isRegional: z.boolean().optional(),
    isRegionalRequested: z.boolean().optional(),
  }),
  payment: z.object({
    paymentIntentId: z.string(),
    modelAJobId: z.string().optional(),
    provisionalJobId: z.string().optional(),
  }),
});

export async function POST(req: Request) {
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    const completionGuard = await requireRoleCompletion(role.userId, "JOB_POSTER");
    if (completionGuard) return completionGuard;

    const raw = await req.json().catch(() => ({}));
    const parsed = FinalizeBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    }

    const result = await finalizeJob(role.userId, parsed.data);
    return NextResponse.json({ success: true, jobId: result.jobId, created: result.created });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to finalize job." },
      { status },
    );
  }
}
