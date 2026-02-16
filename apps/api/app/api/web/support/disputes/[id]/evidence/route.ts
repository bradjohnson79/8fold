import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { handleApiError } from "../../../../../../../src/lib/errorHandler";
import { badRequest, fail, ok } from "../../../../../../../src/lib/api/respond";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../../../db/schema/disputeCase";
import { disputeEvidence } from "../../../../../../../db/schema/disputeEvidence";
import { supportAttachments } from "../../../../../../../db/schema/supportAttachment";
import { supportTickets } from "../../../../../../../db/schema/supportTicket";
import { sanitizeText } from "../../../../../../../src/utils/sanitizeText";

function getDisputeIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const disputeId = getDisputeIdFromUrl(req);

    const rows = await db
      .select({
        id: disputeCases.id,
        ticketId: disputeCases.ticketId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = rows[0] ?? null;
    if (!dispute) return fail(404, "not_found");
    if (dispute.filedByUserId !== user.userId && dispute.againstUserId !== user.userId) {
      return fail(403, "forbidden");
    }

    const evidence = await db
      .select({
        id: disputeEvidence.id,
        createdAt: disputeEvidence.createdAt,
        submittedByUserId: disputeEvidence.submittedByUserId,
        kind: disputeEvidence.kind,
        summary: disputeEvidence.summary,
        url: disputeEvidence.url,
        metadata: disputeEvidence.metadata,
      })
      .from(disputeEvidence)
      .where(eq(disputeEvidence.disputeCaseId, disputeId))
      .orderBy(asc(disputeEvidence.createdAt))
      .limit(500);

    return ok({
      evidence: evidence.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/support/disputes/[id]/evidence");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const disputeId = getDisputeIdFromUrl(req);

    const rows = await db
      .select({
        id: disputeCases.id,
        ticketId: disputeCases.ticketId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = rows[0] ?? null;
    if (!dispute) return fail(404, "not_found");
    if (dispute.filedByUserId !== user.userId && dispute.againstUserId !== user.userId) {
      return fail(403, "forbidden");
    }

    const form = await req.formData();
    const file = form.get("file");
    const descriptionRaw = String(form.get("description") ?? "");
    const description = sanitizeText(descriptionRaw, { maxLen: 400 });
    if (!(file instanceof File)) return badRequest("file_required");
    if (description.length < 1 || description.length > 400) {
      return badRequest("description_required");
    }

    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) return badRequest("file_too_large");

    const mimeType = file.type || "application/octet-stream";
    const ext = ALLOWED[mimeType] ?? null;
    if (!ext) return badRequest("unsupported_file_type");

    // Store file in same local evidence store as support attachments (keyed by ticketId).
    const storageKey = `${dispute.ticketId}/${randomUUID()}.${ext}`;
    const uploadsDir = path.join(process.cwd(), ".data", "support-attachments", dispute.ticketId);
    await mkdir(uploadsDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, storageKey.split("/")[1]!), buf, { flag: "wx" });
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

    const created = await db.transaction(async (tx) => {
      // Ensure ticket exists (sanity).
      const t = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, dispute.ticketId)).limit(1);
      if (!t[0]) throw Object.assign(new Error("Ticket not found"), { status: 404 });

      const attRows = await tx
        .insert(supportAttachments)
        .values({
          id: crypto.randomUUID(),
          ticketId: dispute.ticketId,
          uploadedById: user.userId,
          originalName: file.name || `evidence.${ext}`,
          mimeType,
          sizeBytes: file.size,
          storageKey,
          sha256,
        } as any)
        .returning({
          id: supportAttachments.id,
          createdAt: supportAttachments.createdAt,
          originalName: supportAttachments.originalName,
          mimeType: supportAttachments.mimeType,
          sizeBytes: supportAttachments.sizeBytes,
        });
      const att = attRows[0] as any;

      const evRows = await tx
        .insert(disputeEvidence)
        .values({
          id: crypto.randomUUID(),
          disputeCaseId: disputeId,
          submittedByUserId: user.userId,
          kind: "FILE",
          summary: description,
          url: `/api/web/support/attachments/${att.id}`,
          metadata: { attachmentId: att.id, mimeType, sizeBytes: file.size, originalName: att.originalName },
        } as any)
        .returning({
          id: disputeEvidence.id,
          createdAt: disputeEvidence.createdAt,
          submittedByUserId: disputeEvidence.submittedByUserId,
          kind: disputeEvidence.kind,
          summary: disputeEvidence.summary,
          url: disputeEvidence.url,
          metadata: disputeEvidence.metadata,
        });
      const ev = evRows[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "DISPUTE_EVIDENCE_ADDED",
        entityType: "DisputeCase",
        entityId: disputeId,
        metadata: {
          ticketId: dispute.ticketId,
          attachmentId: att.id,
          evidenceId: ev.id,
          mimeType,
          sizeBytes: file.size,
          sanitized: true,
          truncated: description.length < descriptionRaw.trim().length,
        } as any,
      });

      return ev;
    });

    return ok(
      {
        evidence: {
          ...created,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err, "POST /api/web/support/disputes/[id]/evidence");
  }
}

