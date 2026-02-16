import nodemailer from "nodemailer";

type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const portRaw = String(process.env.SMTP_PORT ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim();
  if (!host || !portRaw || !from) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;

  const user = String(process.env.SMTP_USER ?? "").trim() || undefined;
  const pass = String(process.env.SMTP_PASS ?? "").trim() || undefined;

  return { host, port, user, pass, from };
}

export async function sendLoginCodeEmail(args: { toEmail: string; code: string }) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    throw Object.assign(new Error("Email delivery is not configured."), { status: 409 });
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  const subject = "Your 8Fold login code";
  const text = `Your 8Fold one-time login code is: ${args.code}\n\nThis code expires in 15 minutes.`;

  await transporter.sendMail({
    from: cfg.from,
    to: args.toEmail,
    subject,
    text,
  });
}

