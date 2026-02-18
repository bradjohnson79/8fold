import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireUser, requireAdmin, requireSeniorRouter } from "../../../../../../../src/auth/rbac";
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../../../db/schema/disputeCase";
import { supportAttachments } from "../../../../../../../db/schema/supportAttachment";
import { supportTickets } from "../../../../../../../db/schema/supportTicket";

function getTicketIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};

async function requireAdminOrSeniorRouter(req: Request) {
  try {
    return await requireAdmin(req);
  } catch {
    return await requireSeniorRouter(req);
  }
}

function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const authed = await requireUser(req);
    const ticketId = getTicketIdFromUrl(req);

    const rows = await db
      .select({
        id: supportTickets.id,
        createdById: supportTickets.createdById,
        type: supportTickets.type,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    const ticket = rows[0] ?? null;
    if (!ticket) return fail(404, "Not found");

    const role = String(authed.role);
    const isStaff = role === "ADMIN" || role === "ROUTER";
    if (isStaff && role === "ROUTER") {
      // If router, must be senior router to view others' evidence; otherwise only view own.
      if (ticket.createdById !== authed.userId) {
        await requireAdminOrSeniorRouter(req);
      }
    } else if (role === "ADMIN") {
      // ok
    } else {
      const isCreator = ticket.createdById === authed.userId;
      const isAgainstParty = ticket.type === "DISPUTE" && ticket.againstUserId === authed.userId;
      if (!isCreator && !isAgainstParty) return fail(403, "Forbidden");
    }

    const attachments = await db
      .select({
        id: supportAttachments.id,
        originalName: supportAttachments.originalName,
        mimeType: supportAttachments.mimeType,
        sizeBytes: supportAttachments.sizeBytes,
        createdAt: supportAttachments.createdAt,
      })
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, ticketId))
      .orderBy(asc(supportAttachments.createdAt))
      .limit(200);

    return ok({
      attachments: attachments.map((a: any) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        downloadUrl: `/api/web/support/attachments/${a.id}`
      })),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role) || role === "ADMIN") {
      return fail(403, "Forbidden");
    }

    const ticketId = getTicketIdFromUrl(req);
    const rows = await db
      .select({
        id: supportTickets.id,
        createdById: supportTickets.createdById,
        type: supportTickets.type,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    const ticket = rows[0] ?? null;
    if (!ticket) return fail(404, "Ticket not found");
    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && ticket.againstUserId === user.userId;
    if (!isCreator && !isAgainstParty) return fail(403, "Forbidden");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail(400, "Invalid input");
    }

    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      return fail(400, "File too large (max 12MB)");
    }

    const mimeType = file.type || "application/octet-stream";
    const ext = ALLOWED[mimeType] ?? null;
    if (!ext) {
      return fail(400, "Unsupported file type");
    }

    const storageKey = `${ticketId}/${randomUUID()}.${ext}`;
    const uploadsDir = path.join(process.cwd(), ".data", "support-attachments", ticketId);
    await mkdir(uploadsDir, { recursive: true });

    const buf = Buffer.from(await file.arrayBuffer());
    // Evidence immutability: never overwrite files.
    await writeFile(path.join(uploadsDir, storageKey.split("/")[1]!), buf, { flag: "wx" });
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

    const created = await db.transaction(async (tx) => {
      const attRows = await tx
        .insert(supportAttachments)
        .values({
          id: crypto.randomUUID(),
          ticketId,
          uploadedById: user.userId,
          originalName: file.name || `evidence.${ext}`,
          mimeType,
          sizeBytes: file.size,
          storageKey,
          sha256,
        } as any)
        .returning({
          id: supportAttachments.id,
          originalName: supportAttachments.originalName,
          mimeType: supportAttachments.mimeType,
          sizeBytes: supportAttachments.sizeBytes,
          createdAt: supportAttachments.createdAt,
        });
      const att = attRows[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "SUPPORT_EVIDENCE_UPLOADED",
        entityType: "SupportTicket",
        entityId: ticketId,
        metadata: {
          attachmentId: att.id,
          mimeType,
          sizeBytes: file.size,
        } as any,
      });

      return att;
    });

    return ok(
      {
        attachment: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          downloadUrl: `/api/web/support/attachments/${created.id}`,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

