import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { db } from "@/db/drizzle";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { createAdjustmentRequest } from "@/src/services/v4/v4JobPriceAdjustmentService";

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  const { threadId } = await ctx.params;

  const threads = await db
    .select({ id: v4MessageThreads.id, jobId: v4MessageThreads.jobId, contractorUserId: v4MessageThreads.contractorUserId })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const thread = threads[0];
  if (!thread || thread.contractorUserId !== role.userId) {
    return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => ({}));
  const requestedPriceCents = Number(raw?.requestedPriceCents);
  const contractorScopeDetails = String(raw?.contractorScopeDetails ?? "").trim();
  const additionalScopeDetails = String(raw?.additionalScopeDetails ?? "").trim();

  try {
    const result = await createAdjustmentRequest(threadId, role.userId, thread.jobId, {
      requestedPriceCents,
      contractorScopeDetails,
      additionalScopeDetails,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to create request" }, { status });
  }
}
