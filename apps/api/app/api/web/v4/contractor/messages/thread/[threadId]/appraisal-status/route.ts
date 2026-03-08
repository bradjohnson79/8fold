import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { db } from "@/db/drizzle";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { getAppraisalStatusForJob } from "@/src/services/v4/v4JobPriceAdjustmentService";

export async function GET(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  const { threadId } = await ctx.params;

  const threads = await db
    .select({ jobId: v4MessageThreads.jobId, contractorUserId: v4MessageThreads.contractorUserId })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const thread = threads[0];
  if (!thread || thread.contractorUserId !== role.userId) {
    return NextResponse.json({ exists: false, status: null });
  }

  const result = await getAppraisalStatusForJob(thread.jobId, role.userId);
  return NextResponse.json(result);
}
