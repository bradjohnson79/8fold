import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routerWaitlist } from "@/db/schema/routerWaitlist";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";

const BodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
});

const emailWrap = (body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:#111827;padding:20px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">8Fold</span>
        </td></tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">You are receiving this because you joined the 8Fold launch network.</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">© 2025 8Fold Marketplace Inc.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

function buildConfirmationEmail(firstName: string): string {
  return emailWrap(`
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">You're on the 8Fold launch list</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">Hello ${firstName},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">
      Thanks for your interest in becoming a Router on 8Fold.
    </p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">
      We're currently building the California contractor network during Phase 1.
      You'll be notified as soon as Phase 2 opens for routers.
    </p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">— The 8Fold Team</p>
  `);
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { firstName, lastName, email, city, state } = parsed.data;

  const existing = await db
    .select({ id: routerWaitlist.id })
    .from(routerWaitlist)
    .where(eq(routerWaitlist.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  await db.insert(routerWaitlist).values({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    email: email.toLowerCase(),
    city,
    state,
    createdAt: new Date(),
  });

  void sendTransactionalEmail({
    to: email,
    subject: "You're on the 8Fold launch list",
    html: buildConfirmationEmail(firstName),
    text: `Hello ${firstName},\n\nThanks for your interest in becoming a Router on 8Fold.\n\nWe're currently building the California contractor network during Phase 1. You'll be notified as soon as Phase 2 opens for routers.\n\n— The 8Fold Team\n\nYou are receiving this because you joined the 8Fold launch network.`,
  }).catch((err) => {
    console.error("[ROUTER_WAITLIST_EMAIL_ERROR]", { email, err: String(err) });
  });

  return NextResponse.json({ ok: true, alreadySubscribed: false });
}
