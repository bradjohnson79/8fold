import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireUser, requireAdmin, requireSeniorRouter } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { disputeCases } from "../../../../../../db/schema/disputeCase";
import { supportAttachments } from "../../../../../../db/schema/supportAttachment";
import { supportTickets } from "../../../../../../db/schema/supportTicket";

function getAttachmentIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

async function requireAdminOrSeniorRouter(req: Request) {
  try {
    return await requireAdmin(req);
  } catch {
    return await requireSeniorRouter(req);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const id = getAttachmentIdFromUrl(req);

    const rows = await db
      .select({
        id: supportAttachments.id,
        ticketId: supportAttachments.ticketId,
        storageKey: supportAttachments.storageKey,
        originalName: supportAttachments.originalName,
        mimeType: supportAttachments.mimeType,
        sizeBytes: supportAttachments.sizeBytes,
        ticketCreatedById: supportTickets.createdById,
        ticketType: supportTickets.type,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportAttachments)
      .innerJoin(supportTickets, eq(supportTickets.id, supportAttachments.ticketId))
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportAttachments.id, id))
      .limit(1);
    const att = rows[0] ?? null;
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Authorization:
    // - ticket creator OR (dispute against party) OR Admin OR Senior Router.
    const isCreator = att.ticketCreatedById === user.userId;
    const isAgainstParty = att.ticketType === "DISPUTE" && att.againstUserId === user.userId;
    if (!isCreator && !isAgainstParty) {
      await requireAdminOrSeniorRouter(req);
    }

    const filePath = path.join(process.cwd(), ".data", "support-attachments", att.storageKey);
    const buf = await readFile(filePath);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": att.mimeType || "application/octet-stream",
        "content-length": String(att.sizeBytes),
        "content-disposition": `attachment; filename="${encodeURIComponent(att.originalName)}"`
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

