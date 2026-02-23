import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";

async function getOrCreateActiveDraft(userId: string) {
  const rows = await db
    .select()
    .from(jobDraft)
    .where(and(eq(jobDraft.userId, userId), eq(jobDraft.status, "ACTIVE")))
    .limit(1);
  const existing = rows[0] ?? null;
  if (existing) return existing;

  const inserted = await db
    .insert(jobDraft)
    .values({
      id: crypto.randomUUID(),
      userId,
      status: "ACTIVE",
      step: "DETAILS",
      data: {},
    })
    .returning();
  return inserted[0];
}

export async function GET(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const draft = await getOrCreateActiveDraft(user.userId);
    return NextResponse.json({ success: true, draft });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to load draft." },
      { status }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const current = await getOrCreateActiveDraft(user.userId);
    const body = (await req.json().catch(() => null)) as {
      step?: "DETAILS" | "PRICING" | "AVAILABILITY" | "PAYMENT" | "CONFIRMED";
      dataPatch?: Record<string, unknown>;
    } | null;

    const currentData =
      current.data && typeof current.data === "object" && !Array.isArray(current.data)
        ? (current.data as Record<string, unknown>)
        : {};
    const patch =
      body?.dataPatch && typeof body.dataPatch === "object" && !Array.isArray(body.dataPatch)
        ? body.dataPatch
        : {};
    const mergedData = { ...currentData, ...patch };

    const updates: Partial<typeof jobDraft.$inferInsert> = {
      data: mergedData,
      updatedAt: new Date(),
    };
    if (body?.step) updates.step = body.step;

    const updatedRows = await db
      .update(jobDraft)
      .set(updates)
      .where(and(eq(jobDraft.id, current.id), eq(jobDraft.userId, user.userId)))
      .returning();

    return NextResponse.json({ success: true, draft: updatedRows[0] ?? current });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to update draft." },
      { status }
    );
  }
}
