/**
 * DISE isolation boundary (Directory Intelligence & Submission Engine).
 *
 * - No dependencies on job lifecycle (jobs/dispatch/completion).
 * - No dependencies on ledger or Stripe/payments.
 * - DB access must target ONLY `directory_engine` tables via `@/db/schema/directoryEngine`.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { directories } from "@/db/schema/directoryEngine";

type PatchBody = {
  status?: "NEW" | "REVIEWED" | "APPROVED" | "REJECTED";
  notes?: string;
  name?: string;
  homepageUrl?: string;
  submissionUrl?: string;
  contactEmail?: string;
  region?: string;
  country?: string;
  category?: string;
  scope?: "REGIONAL" | "NATIONAL";
  targetUrlOverride?: string | null;
  free?: boolean;
  requiresApproval?: boolean;
  authorityScore?: number;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [row] = await db.select().from(directories).where(eq(directories.id, id));
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE directory get error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const update: Record<string, unknown> = {};
    if (body.status != null) update.status = body.status;
    if (body.notes != null) update.notes = body.notes;
    if (body.name != null) update.name = body.name;
    if (body.homepageUrl != null) update.homepageUrl = body.homepageUrl;
    if (body.submissionUrl != null) update.submissionUrl = body.submissionUrl;
    if (body.contactEmail != null) update.contactEmail = body.contactEmail;
    if (body.region != null) update.region = body.region;
    if (body.country != null) update.country = body.country;
    if (body.category != null) update.category = body.category;
    if (body.scope != null) update.scope = body.scope;
    if (body.targetUrlOverride !== undefined) update.targetUrlOverride = body.targetUrlOverride;
    if (body.free != null) update.free = body.free;
    if (body.requiresApproval != null) update.requiresApproval = body.requiresApproval;
    if (body.authorityScore != null) update.authorityScore = body.authorityScore;

    const [row] = await db
      .update(directories)
      .set(update)
      .where(eq(directories.id, id))
      .returning();

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE directory patch error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
