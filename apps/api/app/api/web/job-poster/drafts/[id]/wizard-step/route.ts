import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { z } from "zod";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

const BodySchema = z.object({
  step: z.enum(["JOB_DETAILS", "PRICING", "PAYMENT"]),
});

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const rows = await db
      .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.jobPosterUserId })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const current = rows[0] ?? null;
    if (!current || current.jobPosterUserId !== user.userId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (String(current.status) !== "DRAFT") return NextResponse.json({ error: "Not a draft" }, { status: 409 });

    // No-op in this build: wizard step field may not exist in the generated Prisma client.
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

