import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
import { getApprovedContractorForUserId } from "../../../../../../../src/services/contractorIdentity";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import {
  auditLogs,
  materialsReceiptFiles,
  materialsReceiptSubmissions,
  materialsRequests,
} from "../../../../../../../db/schema";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../materials-requests/:id/receipts/submit
  return parts[parts.length - 3] ?? "";
}

const BodySchema = z.object({
  submit: z.literal(true)
});

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const requestId = getIdFromUrl(req);
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const c = await getApprovedContractorForUserId(tx, u.userId);
      if (c.kind !== "ok") return { kind: "no_contractor" as const };

      const mr =
        (
          await tx
            .select({
              id: materialsRequests.id,
              status: materialsRequests.status,
              contractorId: materialsRequests.contractorId,
            })
            .from(materialsRequests)
            .where(eq(materialsRequests.id, requestId))
            .limit(1)
        )[0] ?? null;
      if (!mr) return { kind: "not_found" as const };
      if (mr.contractorId !== c.contractor.id) return { kind: "forbidden" as const };

      if (mr.status !== "ESCROWED") return { kind: "not_escrowed" as const };

      const submission =
        (
          await tx
            .select({
              id: materialsReceiptSubmissions.id,
              status: materialsReceiptSubmissions.status,
              receiptTotalCents: materialsReceiptSubmissions.receiptTotalCents,
            })
            .from(materialsReceiptSubmissions)
            .where(eq(materialsReceiptSubmissions.requestId, mr.id))
            .limit(1)
        )[0] ?? null;
      if (!submission?.id) return { kind: "no_receipts" as const };
      if (submission.status === "SUBMITTED") return { kind: "already" as const };

      const fileCount =
        (
          await tx
            .select({ c: sql<number>`count(${materialsReceiptFiles.id})` })
            .from(materialsReceiptFiles)
            .where(eq(materialsReceiptFiles.submissionId, submission.id))
        )[0]?.c ?? 0;
      if (fileCount === 0) return { kind: "no_files" as const };

      await tx
        .update(materialsReceiptSubmissions)
        .set({ status: "SUBMITTED" as any, submittedAt: now, updatedAt: now })
        .where(eq(materialsReceiptSubmissions.id, submission.id));
      await tx
        .update(materialsRequests)
        .set({ status: "RECEIPTS_SUBMITTED" as any, updatedAt: now })
        .where(eq(materialsRequests.id, mr.id));
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "MATERIALS_RECEIPTS_SUBMITTED",
        entityType: "MaterialsRequest",
        entityId: mr.id,
        metadata: { receiptTotalCents: submission.receiptTotalCents } as any,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "no_contractor") return NextResponse.json({ error: "Contractor not approved" }, { status: 403 });
    if (result.kind === "not_escrowed") return NextResponse.json({ error: "Escrow not funded yet" }, { status: 409 });
    if (result.kind === "no_receipts") return NextResponse.json({ error: "Upload receipts first" }, { status: 409 });
    if (result.kind === "no_files") return NextResponse.json({ error: "Upload receipts first" }, { status: 409 });
    if (result.kind === "already") return NextResponse.json({ ok: true, alreadySubmitted: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

