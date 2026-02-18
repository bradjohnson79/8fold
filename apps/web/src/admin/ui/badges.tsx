import React from "react";
import { AdminColors } from "./theme";

type Tone = "neutral" | "warn" | "danger" | "ok" | "info";

const toneStyles: Record<Tone, { fg: string; border: string; bg: string }> = {
  neutral: {
    fg: AdminColors.text,
    border: AdminColors.border,
    bg: AdminColors.grayPill,
  },
  warn: {
    fg: AdminColors.danger,
    border: "rgba(220, 38, 38, 0.22)",
    bg: AdminColors.dangerSoft,
  },
  danger: {
    fg: AdminColors.danger,
    border: "rgba(220, 38, 38, 0.22)",
    bg: AdminColors.dangerSoft,
  },
  ok: {
    fg: AdminColors.green,
    border: AdminColors.greenBorder,
    bg: AdminColors.greenSoft,
  },
  info: {
    fg: AdminColors.text,
    border: AdminColors.border,
    bg: AdminColors.graySoft,
  },
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const s = toneStyles[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.fg,
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: 0.2,
        lineHeight: "12px",
      }}
    >
      {label}
    </span>
  );
}

export function contractorStatusTone(status: "PENDING" | "APPROVED" | "REJECTED"): Tone {
  if (status === "APPROVED") return "ok";
  if (status === "PENDING") return "info";
  return "warn";
}

export function jobDraftStatusTone(
  status: "DRAFT" | "IN_REVIEW" | "NEEDS_CLARIFICATION" | "REJECTED" | "APPROVED"
): Tone {
  if (status === "APPROVED") return "ok";
  if (status === "IN_REVIEW") return "info";
  if (status === "NEEDS_CLARIFICATION") return "warn";
  if (status === "REJECTED") return "neutral";
  return "neutral";
}

export function jobStatusTone(
  status:
    | "DRAFT"
    | "PUBLISHED"
    | "OPEN_FOR_ROUTING"
    | "ASSIGNED"
    | "IN_PROGRESS"
    | "CONTRACTOR_COMPLETED"
    | "CUSTOMER_APPROVED"
    | "CUSTOMER_REJECTED"
    | "COMPLETION_FLAGGED"
    | "COMPLETED_APPROVED"
): Tone {
  if (status === "COMPLETED_APPROVED") return "ok";
  if (status === "CUSTOMER_REJECTED") return "warn";
  if (status === "COMPLETION_FLAGGED") return "warn";
  if (status === "PUBLISHED") return "info";
  if (status === "OPEN_FOR_ROUTING") return "info";
  if (status === "ASSIGNED") return "info";
  if (status === "IN_PROGRESS") return "info";
  if (status === "CONTRACTOR_COMPLETED") return "info";
  if (status === "CUSTOMER_APPROVED") return "info";
  return "neutral";
}

export function payoutRequestTone(status: "REQUESTED" | "REJECTED" | "PAID" | "CANCELLED"): Tone {
  if (status === "REQUESTED") return "info";
  if (status === "PAID") return "ok";
  return "neutral";
}

