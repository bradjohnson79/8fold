import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { createSupportTicket } from "@/src/services/v4/v4SupportService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";

const ALLOWED_ROLES = ["JOB_POSTER", "ROUTER", "CONTRACTOR"] as const;

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const user = authed.internalUser;
    if (!user) {
      return NextResponse.json(toV4ErrorResponse({ status: 403, code: "V4_USER_NOT_FOUND", message: "User not found" } as V4Error, requestId), { status: 403 });
    }

    const role = String(user.role ?? "").toUpperCase();
    if (!role || !ALLOWED_ROLES.includes(role as any)) {
      return NextResponse.json(toV4ErrorResponse({ status: 403, code: "V4_ROLE_MISMATCH", message: "Access denied" } as V4Error, requestId), { status: 403 });
    }

    const raw = await req.json().catch(() => ({}));
    const subject = typeof raw?.subject === "string" ? String(raw.subject).trim() : "";
    const category = typeof raw?.category === "string" ? String(raw.category).trim() : "GENERAL_SUPPORT";
    const ticketType = typeof raw?.ticketType === "string" ? String(raw.ticketType).trim() : null;
    const priority = typeof raw?.priority === "string" ? String(raw.priority).trim() : null;
    const body = typeof raw?.body === "string" ? String(raw.body).trim() : (typeof raw?.message === "string" ? String(raw.message).trim() : "");
    const jobId = typeof raw?.jobId === "string" ? String(raw.jobId).trim() : null;
    const conversationId = typeof raw?.conversationId === "string" ? String(raw.conversationId).trim() : null;
    const attachmentPointers = raw?.attachmentPointers;

    if (!subject) throw badRequest("V4_SUPPORT_SUBJECT_REQUIRED", "Subject is required");
    if (!body) throw badRequest("V4_SUPPORT_BODY_REQUIRED", "Message body is required");

    const { id, routedTo } = await createSupportTicket(user.id, role, subject, category, body, {
      jobId,
      conversationId,
      attachmentPointers,
      ticketType,
      priority,
    });

    if (routedTo === "SUPPORT_TICKET") {
      const adminEmails = String(process.env.ADMIN_SUPER_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      if (adminEmails.length > 0) {
        const roleLabel =
          role === "CONTRACTOR" ? "Contractor" : role === "ROUTER" ? "Router" : "Job Poster";
        const subjectLine = `[8Fold Support] ${roleLabel} Ticket – ${subject}`;
        const adminOrigin =
          String(process.env.ADMIN_ORIGIN ?? "").trim() || "https://admin.8fold.app";
        const adminLink = `${adminOrigin.replace(/\/+$/, "")}/support/v4/${id}`;
        const truncatedBody = body.length > 500 ? body.slice(0, 500) + "…" : body;
        const html = `
          <p><strong>Ticket ID:</strong> ${id}</p>
          <p><strong>Role:</strong> ${roleLabel}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px;">${truncatedBody.replace(/</g, "&lt;")}</pre>
          <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
          <p><a href="${adminLink}" style="color:#10b981;font-weight:700;">View in Admin →</a></p>
        `;
        const text = `Ticket ID: ${id}\nRole: ${roleLabel}\nSubject: ${subject}\n\nMessage:\n${truncatedBody}\n\nSubmitted: ${new Date().toISOString()}\nView: ${adminLink}`;
        for (const adminEmail of adminEmails) {
          void sendTransactionalEmail({
            to: adminEmail,
            subject: subjectLine,
            html: `<!DOCTYPE html><html><body>${html}</body></html>`,
            text,
          }).catch((e) => console.error("[SUPPORT_TICKET_ADMIN_EMAIL_ERROR]", e));
        }
      }
    }

    return NextResponse.json({ id, routedTo });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SUPPORT_TICKET_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
