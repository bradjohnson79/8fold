import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { adminAnnouncements } from "@/db/schema/adminAnnouncement";
import { users } from "@/db/schema/user";
import { waitlistSubscribers } from "@/db/schema/waitlistSubscriber";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(5000),
  audienceType: z.enum(["contractors", "routers", "job_posters", "all"]),
});

const BATCH_SIZE = 25;

const emailWrap = (body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:#111827;padding:20px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">8Fold</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">You are receiving this because you joined the 8Fold launch network.</p>
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2025 8Fold Marketplace Inc.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

function buildAnnouncementEmail(title: string, message: string): string {
  const paragraphs = message
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">${line}</p>`)
    .join("");

  const body = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">${title}</h1>
    ${paragraphs}
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#374151;">— The 8Fold Team</p>
  `;
  return emailWrap(body);
}

type Recipient = { email: string };

async function getRecipients(audienceType: string): Promise<Recipient[]> {
  if (audienceType === "all") {
    // Platform users with emails
    const platformUsers = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.role, ["CONTRACTOR", "ROUTER", "JOB_POSTER"] as any[]));

    // Also include waitlist subscribers
    const waitlistUsers = await db
      .select({ email: waitlistSubscribers.email })
      .from(waitlistSubscribers);

    const emails = new Set<string>();
    for (const u of platformUsers) { if (u.email) emails.add(u.email); }
    for (const u of waitlistUsers) { if (u.email) emails.add(u.email); }
    return Array.from(emails).map((email) => ({ email }));
  }

  if (audienceType === "routers" || audienceType === "job_posters") {
    // Pull from waitlist subscribers for these roles (they don't have platform accounts yet in Phase 1)
    const roleType = audienceType === "routers" ? "router" : "job_poster";
    const rows = await db
      .select({ email: waitlistSubscribers.email })
      .from(waitlistSubscribers)
      .where(inArray(waitlistSubscribers.roleType, [roleType]));
    return rows.filter((r) => r.email).map((r) => ({ email: r.email }));
  }

  if (audienceType === "contractors") {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.role, ["CONTRACTOR"] as any[]));
    return rows.filter((r) => r.email).map((r) => ({ email: r.email! }));
  }

  return [];
}

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const rows = await db
    .select()
    .from(adminAnnouncements)
    .orderBy(desc(adminAnnouncements.createdAt))
    .limit(100);

  return ok({ announcements: rows });
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid announcement payload";
    return err(400, "ADMIN_V4_INVALID_REQUEST", msg);
  }

  const { title, message, audienceType } = parsed.data;

  const recipients = await getRecipients(audienceType);

  // Batch send to avoid server timeouts
  const html = buildAnnouncementEmail(title, message);
  const plainText = `${title}\n\n${message}\n\n— The 8Fold Team\n\nYou are receiving this because you joined the 8Fold launch network.`;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map((r) =>
        sendTransactionalEmail({ to: r.email, subject: title, html, text: plainText }).catch((e) => {
          console.error("[ANNOUNCEMENT_EMAIL_ERROR]", { email: r.email, err: String(e) });
        }),
      ),
    );
  }

  const sentAt = new Date();
  const rows = await db
    .insert(adminAnnouncements)
    .values({
      id: crypto.randomUUID(),
      title,
      message,
      audienceType,
      status: "sent",
      recipientCount: recipients.length,
      createdBy: authed.email ?? authed.adminId,
      sentAt,
      createdAt: sentAt,
    })
    .returning();

  return ok({ announcement: rows[0] ?? null, recipientCount: recipients.length }, 201);
}
