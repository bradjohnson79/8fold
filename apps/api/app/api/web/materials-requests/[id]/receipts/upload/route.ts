import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
import { getApprovedContractorForUserId } from "../../../../../../../src/services/contractorIdentity";
import { extractReceiptTotals } from "../../../../../../../src/ai/receiptExtraction";
import { storeMaterialsReceiptFile } from "../../../../../../../src/storage/materialsReceipts";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import {
  auditLogs,
  materialsEscrows,
  materialsReceiptFiles,
  materialsReceiptSubmissions,
  materialsRequests,
} from "../../../../../../../db/schema";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../materials-requests/:id/receipts/upload
  return parts[parts.length - 3] ?? "";
}

const BodySchema = z.object({
  files: z
    .array(
      z.object({
        originalName: z.string().trim().min(1).max(180),
        mimeType: z.string().trim().min(3).max(100),
        base64: z.string().trim().min(16)
      })
    )
    .min(1)
    .max(10)
});

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const requestId = getIdFromUrl(req);
    const c = await getApprovedContractorForUserId(db as any, u.userId);
    if (c.kind !== "ok") return NextResponse.json({ error: "Contractor not approved" }, { status: 403 });

    const mr =
      (
        await db
          .select({
            id: materialsRequests.id,
            status: materialsRequests.status,
            contractorId: materialsRequests.contractorId,
            currency: materialsRequests.currency,
          })
          .from(materialsRequests)
          .where(eq(materialsRequests.id, requestId))
          .limit(1)
      )[0] ?? null;
    if (!mr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (mr.contractorId !== c.contractor.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (mr.status !== "ESCROWED") return NextResponse.json({ error: "Escrow not funded yet" }, { status: 409 });
    const escrow =
      (
        await db
          .select({ id: materialsEscrows.id, status: materialsEscrows.status })
          .from(materialsEscrows)
          .where(eq(materialsEscrows.requestId, mr.id))
          .limit(1)
      )[0] ?? null;
    if (!escrow || escrow.status !== "HELD") return NextResponse.json({ error: "Escrow missing" }, { status: 409 });

    const existingSubmission =
      (
        await db
          .select({
            id: materialsReceiptSubmissions.id,
            status: materialsReceiptSubmissions.status,
            submittedAt: materialsReceiptSubmissions.submittedAt,
          })
          .from(materialsReceiptSubmissions)
          .where(eq(materialsReceiptSubmissions.requestId, mr.id))
          .limit(1)
      )[0] ?? null;

    const submission =
      existingSubmission ??
      (
        await db
          .insert(materialsReceiptSubmissions)
          .values({
            id: randomUUID(),
            requestId: mr.id,
            status: "DRAFT" as any,
            currency: mr.currency as any,
            updatedAt: new Date(),
          })
          .returning({
            id: materialsReceiptSubmissions.id,
            status: materialsReceiptSubmissions.status,
            submittedAt: materialsReceiptSubmissions.submittedAt,
          })
      )[0]!;

    if (submission.status === "SUBMITTED" || submission.submittedAt) {
      return NextResponse.json({ error: "Receipts already submitted (immutable)" }, { status: 409 });
    }
    const existingFileCount =
      (
        await db
          .select({ c: sql<number>`count(${materialsReceiptFiles.id})` })
          .from(materialsReceiptFiles)
          .where(eq(materialsReceiptFiles.submissionId, submission.id))
      )[0]?.c ?? 0;
    if (existingFileCount > 0) {
      return NextResponse.json({ error: "Receipts already uploaded" }, { status: 409 });
    }

    // Store files on disk first (non-DB, safe to do outside transactions)
    const storedFiles: Array<{
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      sha256: string;
    }> = [];
    for (const f of body.data.files) {
      const stored = await storeMaterialsReceiptFile({
        submissionId: submission.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        base64: f.base64
      });
      storedFiles.push({
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
      });
    }

    const extracted = await extractReceiptTotals({
      files: body.data.files.map((f) => ({ mimeType: f.mimeType, base64: f.base64, originalName: f.originalName }))
    });

    let purchaseDate: Date | null = null;
    const rawDate = extracted.receipts[0]?.purchaseDate ?? null;
    if (rawDate) {
      const d = new Date(String(rawDate));
      if (!Number.isNaN(d.getTime())) purchaseDate = d;
    }

    const updated = await db.transaction(async (tx) => {
      const latest =
        (
          await tx
            .select({
              id: materialsReceiptSubmissions.id,
              status: materialsReceiptSubmissions.status,
              submittedAt: materialsReceiptSubmissions.submittedAt,
            })
            .from(materialsReceiptSubmissions)
            .where(eq(materialsReceiptSubmissions.id, submission.id))
            .limit(1)
        )[0] ?? null;
      if (!latest) throw Object.assign(new Error("Receipt submission not found"), { status: 404 });
      if (latest.status === "SUBMITTED" || latest.submittedAt) throw Object.assign(new Error("Receipts already submitted (immutable)"), { status: 409 });
      const latestFileCount =
        (
          await tx
            .select({ c: sql<number>`count(${materialsReceiptFiles.id})` })
            .from(materialsReceiptFiles)
            .where(eq(materialsReceiptFiles.submissionId, submission.id))
        )[0]?.c ?? 0;
      if (latestFileCount > 0) throw Object.assign(new Error("Receipts already uploaded"), { status: 409 });

      await tx.insert(materialsReceiptFiles).values(
        storedFiles.map((f: any) => ({
          id: randomUUID(),
          submissionId: submission.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          storageKey: f.storageKey,
          sha256: f.sha256,
        })),
      );

      const now = new Date();
      await tx
        .update(materialsReceiptSubmissions)
        .set({
          receiptSubtotalCents: extracted.totals.subtotalCents,
          receiptTaxCents: extracted.totals.taxCents,
          receiptTotalCents: extracted.totals.totalCents,
          merchantName: extracted.receipts[0]?.merchantName ?? null,
          purchaseDate,
          extractionModel: extracted.model,
          extractionRaw: extracted.raw as unknown as any,
          updatedAt: now,
        })
        .where(eq(materialsReceiptSubmissions.id, submission.id));

      const out =
        (
          await tx
            .select({
              id: materialsReceiptSubmissions.id,
              status: materialsReceiptSubmissions.status,
              receiptSubtotalCents: materialsReceiptSubmissions.receiptSubtotalCents,
              receiptTaxCents: materialsReceiptSubmissions.receiptTaxCents,
              receiptTotalCents: materialsReceiptSubmissions.receiptTotalCents,
              submittedAt: materialsReceiptSubmissions.submittedAt,
            })
            .from(materialsReceiptSubmissions)
            .where(eq(materialsReceiptSubmissions.id, submission.id))
            .limit(1)
        )[0] ?? null;
      if (!out) throw new Error("Failed to load receipt submission");

      const files = await tx
        .select({
          id: materialsReceiptFiles.id,
          originalName: materialsReceiptFiles.originalName,
          mimeType: materialsReceiptFiles.mimeType,
          sizeBytes: materialsReceiptFiles.sizeBytes,
          storageKey: materialsReceiptFiles.storageKey,
        })
        .from(materialsReceiptFiles)
        .where(eq(materialsReceiptFiles.submissionId, submission.id));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "MATERIALS_RECEIPTS_UPLOADED",
        entityType: "MaterialsRequest",
        entityId: mr.id,
        metadata: { submissionId: out.id, receiptTotalCents: out.receiptTotalCents } as any,
      });

      return { ...out, files };
    });

    return NextResponse.json({ submission: updated });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

