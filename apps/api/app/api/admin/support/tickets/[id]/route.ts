import { NextResponse } from "next/server";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { disputeCases } from "@/db/schema/disputeCase";
import { supportAttachments } from "@/db/schema/supportAttachment";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const rows = await db
      .select({
        ticket: supportTickets,
        dispute: disputeCases,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    const ticket = row?.ticket ?? null;
    if (!ticket) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const messages = await db
      .select({ id: supportMessages.id, authorId: supportMessages.authorId, message: supportMessages.message, createdAt: supportMessages.createdAt })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt))
      .limit(1000);

    const attachments = await db
      .select({
        id: supportAttachments.id,
        originalName: supportAttachments.originalName,
        mimeType: supportAttachments.mimeType,
        sizeBytes: supportAttachments.sizeBytes,
        createdAt: supportAttachments.createdAt,
      })
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, id))
      .orderBy(asc(supportAttachments.createdAt))
      .limit(200);

    return NextResponse.json({
      ok: true,
      data: {
        ticket: {
          ...(ticket as any),
          createdAt: (ticket as any).createdAt?.toISOString?.() ?? String((ticket as any).createdAt),
          updatedAt: (ticket as any).updatedAt?.toISOString?.() ?? String((ticket as any).updatedAt),
          disputeCase: row?.dispute?.id
            ? {
                ...(row.dispute as any),
                deadlineAt: (row.dispute as any).deadlineAt?.toISOString?.() ?? String((row.dispute as any).deadlineAt),
                decisionAt: (row.dispute as any).decisionAt ? (row.dispute as any).decisionAt.toISOString() : null,
              }
            : null,
        },
        messages: messages.map((m: any) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        attachments: attachments.map((a: any) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/tickets/[id]", {
      route: "/api/admin/support/tickets/[id]",
      userId: auth.user.userId,
    });
  }
}
