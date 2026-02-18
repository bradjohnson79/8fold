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
import { jobs } from "../../../../../../../db/schema/job";
import { supportAttachments } from "../../../../../../../db/schema/supportAttachment";
import { supportMessages } from "../../../../../../../db/schema/supportMessage";
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
        jobId: disputeCases.jobId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = rows[0] ?? null;
    if (!dispute) return fail(404, "not_found");
    const role = String((user as any).role ?? "").toUpperCase();
    const isParticipant = dispute.filedByUserId === user.userId || dispute.againstUserId === user.userId;
    const isAdmin = role === "ADMIN";
    const isRouter =
      role === "ROUTER" &&
      (
        await db
          .select({ routerUserId: jobs.claimedByUserId })
          .from(jobs)
          .where(eq(jobs.id, dispute.jobId))
          .limit(1)
      )[0]?.routerUserId === user.userId;
    const allowed = isAdmin || isParticipant || isRouter;
    if (!allowed) {
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
        jobId: disputeCases.jobId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = rows[0] ?? null;
    if (!dispute) return fail(404, "not_found");
    const role = String((user as any).role ?? "").toUpperCase();
    const isParticipant = dispute.filedByUserId === user.userId || dispute.againstUserId === user.userId;
    const isAdmin = role === "ADMIN";
    const isRouter =
      role === "ROUTER" &&
      (
        await db
          .select({ routerUserId: jobs.claimedByUserId })
          .from(jobs)
          .where(eq(jobs.id, dispute.jobId))
          .limit(1)
      )[0]?.routerUserId === user.userId;
    const allowed = isAdmin || isParticipant || isRouter;
    if (!allowed) {
      return fail(403, "forbidden");
    }

    const form = await req.formData();
    const file = form.get("file");
    const descriptionRaw = String(form.get("description") ?? "");
    const messageRaw = String(form.get("message") ?? "");
    const description = sanitizeText(descriptionRaw, { maxLen: 400 });
    const message = sanitizeText(messageRaw, { maxLen: 5000 });

    const hasFile = file instanceof File;
    const hasText = message.trim().length > 0 || description.trim().length > 0;
    if (!hasFile && !hasText) return badRequest("evidence_required");
    if (hasText && message.trim().length === 0) {
      // If a client is only sending a "description" for a file, that's fine;
      // but for text-only evidence we require an explicit message.
      if (!hasFile) return badRequest("message_required");
    }
    if (description.length > 400) return badRequest("description_too_long");

    const maxBytes = 12 * 1024 * 1024;
    if (hasFile && (file as File).size > maxBytes) return badRequest("file_too_large");

    let fileMeta:
      | null
      | {
          mimeType: string;
          ext: string;
          storageKey: string;
          buf: Buffer;
          sha256: string;
          originalName: string;
          sizeBytes: number;
        } = null;

    if (hasFile) {
      const f = file as File;
      const mimeType = f.type || "application/octet-stream";
      const ext = ALLOWED[mimeType] ?? null;
      if (!ext) return badRequest("unsupported_file_type");

      // Store file in same local evidence store as support attachments (keyed by ticketId).
      const storageKey = `${dispute.ticketId}/${randomUUID()}.${ext}`;
      const uploadsDir = path.join(process.cwd(), ".data", "support-attachments", dispute.ticketId);
      await mkdir(uploadsDir, { recursive: true });
      const buf = Buffer.from(await f.arrayBuffer());
      await writeFile(path.join(uploadsDir, storageKey.split("/")[1]!), buf, { flag: "wx" });
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      fileMeta = { mimeType, ext, storageKey, buf, sha256, originalName: f.name || `evidence.${ext}`, sizeBytes: f.size };
    }

    const created = await db.transaction(async (tx) => {
      // Ensure ticket exists (sanity).
      const t = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, dispute.ticketId)).limit(1);
      if (!t[0]) throw Object.assign(new Error("Ticket not found"), { status: 404 });

      // Optional timeline message (append-only).
      if (message.trim().length > 0) {
        await tx.insert(supportMessages).values({
          id: crypto.randomUUID(),
          ticketId: dispute.ticketId,
          authorId: user.userId,
          message: message.trim(),
        } as any);
      }

      let att: any = null;
      if (fileMeta) {
        const attRows = await tx
          .insert(supportAttachments)
          .values({
            id: crypto.randomUUID(),
            ticketId: dispute.ticketId,
            uploadedById: user.userId,
            originalName: fileMeta.originalName,
            mimeType: fileMeta.mimeType,
            sizeBytes: fileMeta.sizeBytes,
            storageKey: fileMeta.storageKey,
            sha256: fileMeta.sha256,
          } as any)
          .returning({
            id: supportAttachments.id,
            createdAt: supportAttachments.createdAt,
            originalName: supportAttachments.originalName,
            mimeType: supportAttachments.mimeType,
            sizeBytes: supportAttachments.sizeBytes,
          });
        att = attRows[0] as any;
      }

      // DisputeEvidence record (append-only). Use kind NOTE for text-only, FILE for attachments.
      const kind = fileMeta ? "FILE" : "NOTE";
      const summary =
        fileMeta && description.trim().length > 0
          ? description.trim()
          : !fileMeta && message.trim().length > 0
            ? message.trim().slice(0, 400)
            : description.trim();
      const evRows = await tx
        .insert(disputeEvidence)
        .values({
          id: crypto.randomUUID(),
          disputeCaseId: disputeId,
          submittedByUserId: user.userId,
          kind,
          summary: summary.length > 0 ? summary : null,
          url: att ? `/api/web/support/attachments/${att.id}` : null,
          metadata: att
            ? { attachmentId: att.id, mimeType: fileMeta!.mimeType, sizeBytes: fileMeta!.sizeBytes, originalName: att.originalName }
            : { messageLen: message.trim().length },
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
          evidenceId: ev.id,
          attachmentId: att?.id ?? null,
          mimeType: fileMeta?.mimeType ?? null,
          sizeBytes: fileMeta?.sizeBytes ?? null,
          kind,
          sanitized: true,
          truncated: {
            description: description.length < descriptionRaw.trim().length,
            message: message.length < messageRaw.trim().length,
          },
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

