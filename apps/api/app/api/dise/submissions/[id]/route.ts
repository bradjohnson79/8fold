import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { backlinks } from "@/db/schema/directoryEngine";
import { directories } from "@/db/schema/directoryEngine";
import { submissions } from "@/db/schema/directoryEngine";

type PatchBody = {
  status?: "DRAFT" | "READY" | "SUBMITTED" | "APPROVED" | "REJECTED";
  selectedVariant?: string;
  listingUrl?: string;
  targetUrlOverride?: string | null;
  notes?: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [row] = await db
      .select({
        submission: submissions,
        directory: directories,
      })
      .from(submissions)
      .innerJoin(directories, eq(submissions.directoryId, directories.id))
      .where(eq(submissions.id, id));

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { ...row.submission, directory: row.directory } });
  } catch (err) {
    console.error("DISE submission get error:", err);
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
    if (body.status != null) {
      update.status = body.status;
      if (body.status === "SUBMITTED") update.submittedAt = new Date();
    }
    if (body.selectedVariant != null) update.selectedVariant = body.selectedVariant;
    if (body.listingUrl != null) update.listingUrl = body.listingUrl;
    if (body.targetUrlOverride !== undefined) update.targetUrlOverride = body.targetUrlOverride;
    if (body.notes != null) update.notes = body.notes;

    const [row] = await db
      .update(submissions)
      .set(update)
      .where(eq(submissions.id, id))
      .returning();

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (body.status === "APPROVED" && body.listingUrl) {
      await db.insert(backlinks).values({
        directoryId: row.directoryId,
        listingUrl: body.listingUrl,
        verified: false,
      });
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE submission patch error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
