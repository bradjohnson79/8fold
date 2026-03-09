import { NextResponse } from "next/server";
import { z } from "zod";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { upsertCertification } from "@/src/services/v4/contractorTradeService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export const runtime = "nodejs";

const PostBodySchema = z.object({
  tradeSkillId: z.string().min(1),
  certificationName: z.string().min(1).max(255),
  issuingOrganization: z.string().max(255).optional().nullable(),
  certificateImageUrl: z.string().url().optional().nullable(),
  certificateType: z.string().max(10).optional().nullable(),
  issuedAt: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    const raw = await req.json().catch(() => ({}));
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const cert = await upsertCertification(role.userId, parsed.data);
    return NextResponse.json({ ok: true, certification: cert });
  } catch (err) {
    console.error("V4_CONTRACTOR_CERTIFICATIONS_POST_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CERT_SAVE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
