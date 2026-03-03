import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { createEditRequest } from "@/src/services/v4/jobPosterJobsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const EditRequestSchema = z.object({
  requestedTitle: z.string().trim().min(1).max(500),
  requestedDescription: z.string().trim().min(1).max(50000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const completionGuard = await requireRoleCompletion(role.userId, "JOB_POSTER");
    if (completionGuard) return completionGuard;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = EditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "V4_EDIT_REQUEST_INVALID", message: "Invalid payload" } },
        { status: 400 },
      );
    }

    const result = await createEditRequest(id, role.userId, parsed.data);
    return NextResponse.json({ ok: true, requestId: result.requestId });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_EDIT_REQUEST_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
