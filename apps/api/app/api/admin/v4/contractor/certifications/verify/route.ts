/**
 * PATCH /api/admin/v4/contractor/certifications/verify
 * Admin-only: toggle the `verified` flag on a contractor certification.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { db } from "@/db/drizzle";
import { v4ContractorCertifications } from "@/db/schema/v4ContractorCertifications";

export const runtime = "nodejs";

const BodySchema = z.object({
  certificationId: z.string().min(1),
  verified: z.boolean(),
});

export async function PATCH(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const { certificationId, verified } = parsed.data;

    const rows = await db
      .select({ id: v4ContractorCertifications.id })
      .from(v4ContractorCertifications)
      .where(eq(v4ContractorCertifications.id, certificationId))
      .limit(1);

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: "Certification not found" }, { status: 404 });
    }

    await db
      .update(v4ContractorCertifications)
      .set({ verified })
      .where(eq(v4ContractorCertifications.id, certificationId));

    return NextResponse.json({ ok: true, certificationId, verified });
  } catch (err) {
    console.error("[ADMIN_CERT_VERIFY_ERROR]", err);
    return NextResponse.json({ ok: false, error: "Failed to update certification" }, { status: 500 });
  }
}
