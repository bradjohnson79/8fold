/**
 * Hardcoded default notification templates.
 *
 * 9 priority types have full email + in-app templates.
 * All other types have in-app text only (email falls back gracefully).
 *
 * Variables supported: {{contractor_name}}, {{job_poster_name}}, {{router_name}},
 *   {{job_title}}, {{job_location}}, {{job_price}}, {{dashboard_link}}, {{platform_name}}
 */

export type DefaultTemplate = {
  category: string;
  supportsEmail: boolean;
  supportsInApp: boolean;
  variables: string[];
  emailSubject?: string;
  emailTemplate?: string;
  inAppTemplate?: string;
};

const DASH = "{{dashboard_link}}";

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
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              © 2025 8Fold Marketplace Inc. &bull;
              <a href="${DASH}" style="color:#6b7280;text-decoration:none;">Dashboard</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">${label}</a>`;

const p = (text: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">${text}</h1>`;

const jobBlock = `
<div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
  <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Job Details</p>
  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111827;">{{job_title}}</p>
  <p style="margin:0;font-size:14px;color:#6b7280;">{{job_location}}</p>
</div>`;

export const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  // ── Job Lifecycle ─────────────────────────────────────────────────────────

  NEW_JOB_INVITE: {
    category: "Job Lifecycle",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "job_location", "dashboard_link", "platform_name"],
    emailSubject: "New Job Invitation — Action Required",
    emailTemplate: emailWrap(`
      ${h1("You have a new job invitation")}
      ${p("Hello {{contractor_name}},")}
      ${p("A job has been routed to you through {{platform_name}}.")}
      ${jobBlock}
      ${p("Please review the job and respond from your contractor dashboard. Invitations expire — act quickly to secure the job.")}
      ${btn("{{dashboard_link}}", "Review Invitation")}
      ${p("<small style='color:#9ca3af'>If you did not expect this email, you can safely ignore it.</small>")}
    `),
    inAppTemplate: "You have a new job invitation. Review it now before it expires.",
  },

  JOB_ROUTED: {
    category: "Job Lifecycle",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["router_name", "job_title", "job_location", "job_price", "dashboard_link", "platform_name"],
    emailSubject: "You Routed a Job — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Job Routed Successfully")}
      ${p("Hello {{router_name}},")}
      ${p("You have successfully routed a job to eligible contractors.")}
      ${jobBlock}
      ${p("Once a contractor accepts the invitation, your 8% routing commission will be held in escrow and released after job completion.")}
      ${p("Router payouts are processed every Friday.")}
      ${btn("{{dashboard_link}}", "View Routed Jobs")}
    `),
    inAppTemplate: "You routed \"{{job_title}}\". Awaiting contractor acceptance.",
  },

  CONTRACTOR_ACCEPTED: {
    category: "Job Lifecycle",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["job_poster_name", "contractor_name", "job_title", "dashboard_link", "platform_name"],
    emailSubject: "A Contractor Has Accepted Your Job",
    emailTemplate: emailWrap(`
      ${h1("Great news — a contractor accepted your job!")}
      ${p("Hello {{job_poster_name}},")}
      ${p("A contractor has accepted your job request:")}
      ${jobBlock}
      ${p("You can now coordinate scheduling and details directly through Messenger on the {{platform_name}} platform.")}
      ${btn("{{dashboard_link}}", "Open Dashboard")}
    `),
    inAppTemplate: "A contractor has accepted your job \"{{job_title}}\".",
  },

  JOB_ASSIGNED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "dashboard_link"],
    inAppTemplate: "You have been assigned to \"{{job_title}}\". Check your dashboard for details.",
  },

  JOB_STARTED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title", "dashboard_link"],
    inAppTemplate: "Work has started on \"{{job_title}}\".",
  },

  CONTRACTOR_COMPLETED_JOB: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "dashboard_link"],
    inAppTemplate: "{{contractor_name}} has marked \"{{job_title}}\" as complete.",
  },

  JOB_CANCELLED_BY_CUSTOMER: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "The job \"{{job_title}}\" has been cancelled by the customer.",
  },

  CONTRACTOR_CANCELLED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["contractor_name", "job_title"],
    inAppTemplate: "{{contractor_name}} has cancelled the job \"{{job_title}}\".",
  },

  JOB_PUBLISHED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "Your job \"{{job_title}}\" has been published and is now visible to routers.",
  },

  JOB_REJECTED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A contractor declined the invitation for \"{{job_title}}\".",
  },

  INVITE_EXPIRED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "Your invitation for \"{{job_title}}\" has expired.",
  },

  POSTER_ACCEPTED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "The job poster has approved the completion of \"{{job_title}}\".",
  },

  // ── Messaging ─────────────────────────────────────────────────────────────

  NEW_MESSAGE: {
    category: "Messaging",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["dashboard_link"],
    inAppTemplate: "You have a new message. View it on your dashboard.",
  },

  MESSAGE_RECEIVED: {
    category: "Messaging",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["dashboard_link"],
    inAppTemplate: "You received a new message.",
  },

  // ── Financial ─────────────────────────────────────────────────────────────

  PAYMENT_RECEIVED: {
    category: "Financial",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["job_poster_name", "job_title", "job_price", "dashboard_link", "platform_name"],
    emailSubject: "Payment Received — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Payment Received")}
      ${p("Hello {{job_poster_name}},")}
      ${p("Your payment for the following job has been captured successfully:")}
      ${jobBlock}
      ${p("The funds are held securely in escrow and will be released to your contractor upon job completion and your approval.")}
      ${btn("{{dashboard_link}}", "View Job")}
    `),
    inAppTemplate: "Payment of {{job_price}} received for \"{{job_title}}\".",
  },

  FUNDS_RELEASED: {
    category: "Financial",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "job_price", "dashboard_link", "platform_name"],
    emailSubject: "Funds Released — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Funds Released")}
      ${p("Hello {{contractor_name}},")}
      ${p("Great news! Funds from your completed job are now available:")}
      ${jobBlock}
      ${p("Your earnings of {{job_price}} are being processed to your connected Stripe account.")}
      ${p("Payouts are typically available within 1–2 business days.")}
      ${btn("{{dashboard_link}}", "View Earnings")}
    `),
    inAppTemplate: "Funds of {{job_price}} from \"{{job_title}}\" have been released to your account.",
  },

  PAYMENT_RELEASED: {
    category: "Financial",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title", "job_price"],
    inAppTemplate: "Payment of {{job_price}} for \"{{job_title}}\" has been released.",
  },

  REFUND_PROCESSED: {
    category: "Financial",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title", "job_price"],
    inAppTemplate: "A refund of {{job_price}} for \"{{job_title}}\" has been processed.",
  },

  JOB_REFUNDED: {
    category: "Financial",
    supportsEmail: true,
    supportsInApp: true,
    variables: [
      "job_title",
      "job_title_or_payment",
      "job_poster_name",
      "greeting_name_suffix",
      "refund_amount",
      "refund_currency",
      "card_last4",
      "payment_method_reference",
      "refund_reference",
      "refund_timestamp",
      "dashboard_link",
      "platform_name",
    ],
    emailSubject: "{{platform_name}} refund confirmation for {{job_title_or_payment}}",
    emailTemplate: emailWrap(`
      ${h1("Your refund has been processed")}
      ${p("Hello{{greeting_name_suffix}},")}
      ${p("Your payment for {{job_title_or_payment}} has been successfully refunded.")}
      ${p("Refund details")}
      <ul style="margin:0 0 16px 20px; padding:0; color:#111827; font-size:14px; line-height:1.6;">
        <li><strong>Amount:</strong> {{refund_amount}}</li>
        <li><strong>Currency:</strong> {{refund_currency}}</li>
        <li><strong>Payment method:</strong> {{payment_method_reference}}</li>
        <li><strong>Refund reference:</strong> {{refund_reference}}</li>
        <li><strong>Processed at:</strong> {{refund_timestamp}}</li>
      </ul>
      ${p("The funds will appear in your account within 5–10 business days.")}
      ${btn("{{dashboard_link}}", "View Dashboard")}
      ${p("Thank you,")}
      ${p("{{platform_name}} Payments")}
    `),
    inAppTemplate: "Your payment for \"{{job_title}}\" has been refunded.",
  },

  ROUTER_COMPENSATION_PROCESSED: {
    category: "Financial",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["router_name", "job_title"],
    inAppTemplate: "Your routing commission for \"{{job_title}}\" has been processed.",
  },

  PAYMENT_EXCEPTION: {
    category: "Financial",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A payment exception occurred for \"{{job_title}}\". Admin has been notified.",
  },

  // ── Support ───────────────────────────────────────────────────────────────

  NEW_SUPPORT_TICKET: {
    category: "Support",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["dashboard_link"],
    inAppTemplate: "A new support ticket has been submitted and is awaiting review.",
  },

  SUPPORT_REPLY: {
    category: "Support",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["dashboard_link", "platform_name"],
    emailSubject: "{{platform_name}} Support Reply",
    emailTemplate: emailWrap(`
      ${h1("You have a support reply")}
      ${p("Hello,")}
      ${p("Our support team has responded to your request.")}
      ${p("Please log in to your dashboard to review the message and continue the conversation.")}
      ${btn("{{dashboard_link}}", "View Reply")}
      ${p("Thank you,")}
      ${p("{{platform_name}} Support")}
    `),
    inAppTemplate: "Our support team has replied to your ticket. View the response on your dashboard.",
  },

  // ── Compliance ────────────────────────────────────────────────────────────

  BREACH_PENALTY_APPLIED: {
    category: "Compliance",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["contractor_name", "job_title"],
    inAppTemplate: "A cancellation penalty has been applied for \"{{job_title}}\". Review your account.",
  },

  SUSPENSION_APPLIED: {
    category: "Compliance",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["contractor_name"],
    inAppTemplate: "Your account has been temporarily suspended. Contact support for details.",
  },

  CONTRACTOR_SUSPENDED: {
    category: "Compliance",
    supportsEmail: false,
    supportsInApp: true,
    variables: [],
    inAppTemplate: "A contractor account has been suspended.",
  },

  // ── System ────────────────────────────────────────────────────────────────

  SYSTEM_ALERT: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: [],
    inAppTemplate: "System alert. Please review your admin dashboard.",
  },

  SYSTEM_ERROR_EVENT: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: [],
    inAppTemplate: "A system error has been logged. Review the system health dashboard.",
  },

  ROUTING_WINDOW_EXPIRED: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "The routing window for \"{{job_title}}\" has expired with no contractor acceptance.",
  },

  ROUTING_EXPIRED_NO_ACCEPT: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "No contractor accepted \"{{job_title}}\". The job has been returned to the queue.",
  },

  JOB_RESET_TO_QUEUE: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "\"{{job_title}}\" has been reset to the routing queue.",
  },

  ASSIGNED_CONTRACTOR_EXPIRED: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "The assigned contractor's window expired for \"{{job_title}}\".",
  },

  JOB_CANCELLED_WITHIN_8H: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A job was cancelled within 8 hours of the appointment: \"{{job_title}}\".",
  },

  HIGH_VALUE_JOB_CANCELLED: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title", "job_price"],
    inAppTemplate: "A high-value job ({{job_price}}) was cancelled: \"{{job_title}}\".",
  },

  DISPUTE_OPENED: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A dispute has been opened for \"{{job_title}}\".",
  },

  ROUTE_INVITE: {
    category: "System",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A routing invitation has been sent for \"{{job_title}}\".",
  },

  // ── Appraisal ─────────────────────────────────────────────────────────────

  RE_APPRAISAL_REQUESTED: {
    category: "Appraisal",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "job_price", "dashboard_link", "platform_name"],
    emailSubject: "Re-Appraisal Requested — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Re-Appraisal Request")}
      ${p("Hello,")}
      ${p("{{contractor_name}} has submitted a re-appraisal request for the following job:")}
      ${jobBlock}
      ${p("The contractor has provided updated scope details and is requesting a price adjustment.")}
      ${p("Please review the request and approve or decline from your dashboard.")}
      ${btn("{{dashboard_link}}", "Review Request")}
    `),
    inAppTemplate: "A re-appraisal has been requested for \"{{job_title}}\". Review the details.",
  },

  RE_APPRAISAL_ACCEPTED: {
    category: "Appraisal",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "job_price", "dashboard_link", "platform_name"],
    emailSubject: "Re-Appraisal Accepted — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Your Re-Appraisal Was Accepted")}
      ${p("Hello {{contractor_name}},")}
      ${p("Great news! Your re-appraisal request has been accepted:")}
      ${jobBlock}
      ${p("The updated price of {{job_price}} has been approved. You can proceed with the updated scope.")}
      ${btn("{{dashboard_link}}", "View Job")}
    `),
    inAppTemplate: "Your re-appraisal for \"{{job_title}}\" has been accepted.",
  },

  RE_APPRAISAL_DECLINED: {
    category: "Appraisal",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["contractor_name", "job_title", "dashboard_link", "platform_name"],
    emailSubject: "Re-Appraisal Declined — {{job_title}}",
    emailTemplate: emailWrap(`
      ${h1("Your Re-Appraisal Was Declined")}
      ${p("Hello {{contractor_name}},")}
      ${p("Your re-appraisal request for the following job has been declined:")}
      ${jobBlock}
      ${p("Please continue with the original agreed-upon scope. If you have concerns, contact support through your dashboard.")}
      ${btn("{{dashboard_link}}", "View Job")}
    `),
    inAppTemplate: "Your re-appraisal for \"{{job_title}}\" has been declined.",
  },

  // ── Scheduling ────────────────────────────────────────────────────────────

  APPOINTMENT_BOOKED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "An appointment has been booked for \"{{job_title}}\".",
  },

  RESCHEDULE_REQUEST: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "A reschedule request has been submitted for \"{{job_title}}\".",
  },

  RESCHEDULE_ACCEPTED: {
    category: "Job Lifecycle",
    supportsEmail: false,
    supportsInApp: true,
    variables: ["job_title"],
    inAppTemplate: "Your reschedule request for \"{{job_title}}\" has been accepted.",
  },

  // ── Admin Signup Alerts ───────────────────────────────────────────────────

  NEW_JOB_POSTER_SIGNUP: {
    category: "Admin Signup Alerts",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["name", "email", "createdAt", "dashboard_link"],
    emailSubject: "New Job Poster Signup — 8Fold",
    emailTemplate: emailWrap(`
      ${h1("New Job Poster Signup")}
      ${p("A new Job Poster has registered on 8Fold.")}
      <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Name:</strong> {{name}}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Email:</strong> {{email}}</p>
        <p style="margin:0;font-size:14px;color:#374151;"><strong>Registered:</strong> {{createdAt}}</p>
      </div>
      ${btn("https://admin.8fold.app/job-posters", "View in Admin Dashboard")}
    `),
    inAppTemplate: "New Job Poster signup: {{name}} ({{email}})",
  },

  NEW_CONTRACTOR_SIGNUP: {
    category: "Admin Signup Alerts",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["name", "email", "createdAt", "dashboard_link"],
    emailSubject: "New Contractor Signup — 8Fold",
    emailTemplate: emailWrap(`
      ${h1("New Contractor Signup")}
      ${p("A new Contractor has registered on 8Fold.")}
      <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Name:</strong> {{name}}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Email:</strong> {{email}}</p>
        <p style="margin:0;font-size:14px;color:#374151;"><strong>Registered:</strong> {{createdAt}}</p>
      </div>
      ${btn("https://admin.8fold.app/contractors", "View in Admin Dashboard")}
    `),
    inAppTemplate: "New Contractor signup: {{name}} ({{email}})",
  },

  NEW_ROUTER_SIGNUP: {
    category: "Admin Signup Alerts",
    supportsEmail: true,
    supportsInApp: true,
    variables: ["name", "email", "createdAt", "dashboard_link"],
    emailSubject: "New Router Signup — 8Fold",
    emailTemplate: emailWrap(`
      ${h1("New Router Signup")}
      ${p("A new Router has registered on 8Fold.")}
      <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Name:</strong> {{name}}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Email:</strong> {{email}}</p>
        <p style="margin:0;font-size:14px;color:#374151;"><strong>Registered:</strong> {{createdAt}}</p>
      </div>
      ${btn("https://admin.8fold.app/routers", "View in Admin Dashboard")}
    `),
    inAppTemplate: "New Router signup: {{name}} ({{email}})",
  },
};
