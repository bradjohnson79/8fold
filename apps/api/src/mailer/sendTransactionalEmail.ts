import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/src/auth/sendLoginCodeEmail";

export async function sendTransactionalEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    console.error("[MAILER] SMTP not configured — skipping email", { to: args.to, subject: args.subject });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}
