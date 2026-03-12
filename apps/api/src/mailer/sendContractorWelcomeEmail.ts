import { sendTransactionalEmail } from "./sendTransactionalEmail";

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
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2025 8Fold Marketplace Inc.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

function buildContractorWelcomeHtml(firstName: string): string {
  const body = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Welcome to the 8Fold Contractor Network</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">Hello ${firstName},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">
      Welcome to the 8Fold contractor network. You are joining during Phase 1 of our California launch
      where we are building the founding contractor network across major cities.
    </p>
    <div style="margin:20px 0;padding:20px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px;">Contractors on 8Fold keep</p>
      <ul style="margin:0;padding-left:18px;color:#374151;font-size:15px;line-height:1.8;">
        <li>80% of local job value</li>
        <li>Up to 85% on regional jobs</li>
        <li>100% of tips</li>
        <li>No lead fees</li>
      </ul>
    </div>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">
      As Phase 1 progresses, you will receive updates about network growth and the upcoming
      Phase 2 launch when job posting opens statewide.
    </p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">— The 8Fold Team</p>
  `;
  return emailWrap(body);
}

export async function sendContractorWelcomeEmail(args: {
  email: string;
  firstName: string;
}): Promise<void> {
  const { email, firstName } = args;
  const displayName = firstName?.trim() || "there";

  await sendTransactionalEmail({
    to: email,
    subject: "Welcome to the 8Fold Contractor Network",
    html: buildContractorWelcomeHtml(displayName),
    text: [
      `Hello ${displayName},`,
      "",
      "Welcome to the 8Fold contractor network. You are joining during Phase 1 of our California launch where we are building the founding contractor network across major cities.",
      "",
      "Contractors on 8Fold keep:",
      "• 80% of local job value",
      "• Up to 85% on regional jobs",
      "• 100% tips",
      "• No lead fees",
      "",
      "As Phase 1 progresses, you will receive updates about network growth and the upcoming Phase 2 launch when job posting opens statewide.",
      "",
      "— The 8Fold Team",
    ].join("\n"),
  });
}
