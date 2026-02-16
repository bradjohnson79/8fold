import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { users } from "../../../../../db/schema/user";
import { jobs } from "../../../../../db/schema/job";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";

const BodySchema = z.object({
  reason: z.string().trim().min(1).max(200),
  customReason: z.string().trim().min(1).max(1000).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const deletionReason = (parsed.data.customReason || parsed.data.reason).trim();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          accountStatus: "ARCHIVED",
          archivedAt: now,
          deletionReason,
          updatedAt: now,
        })
        .where(eq(users.id, user.userId));

      // Archive open/routable jobs for this Job Poster. Never delete payments/dispatch records.
      await tx
        .update(jobs)
        .set({ archived: true })
        .where(and(eq(jobs.jobPosterUserId, user.userId), eq(jobs.status, "OPEN_FOR_ROUTING")));
    });

    return NextResponse.json({ ok: true, accountStatus: "ARCHIVED" }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

