export type LeadBinaryState = "ready" | "risky" | "archived";
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function deriveLeadBinaryState(args: {
  archived: boolean | null | undefined;
  emailVerificationStatus: string | null | undefined;
  priorityScore: number | null | undefined;
  needsEnrichment?: boolean | null | undefined;
  emailVerificationCheckedAt?: Date | string | null | undefined;
  createdAt?: Date | string | null | undefined;
}): LeadBinaryState {
  const verificationStatus = normalize(args.emailVerificationStatus);

  if (args.archived) return "archived";
  if (verificationStatus === "invalid") return "archived";
  if (verificationStatus === "verified" && Number(args.priorityScore ?? 0) >= 85) return "ready";
  return "risky";
}

export function deriveLeadUiVerificationLabel(args: {
  archived: boolean | null | undefined;
  emailVerificationStatus: string | null | undefined;
  priorityScore: number | null | undefined;
  needsEnrichment?: boolean | null | undefined;
  emailVerificationCheckedAt?: Date | string | null | undefined;
  createdAt?: Date | string | null | undefined;
}): string {
  const state = deriveLeadBinaryState(args);
  if (state === "ready") return "verified";
  if (state === "archived") return "archived";

  const verificationStatus = normalize(args.emailVerificationStatus);
  const startedAt = args.emailVerificationCheckedAt
    ? new Date(args.emailVerificationCheckedAt)
    : args.createdAt
      ? new Date(args.createdAt)
      : null;
  const isFreshProcessing = startedAt
    ? Date.now() - startedAt.getTime() < PROCESSING_TIMEOUT_MS
    : true;

  if (args.needsEnrichment || verificationStatus === "unknown" || verificationStatus === "pending") {
    return isFreshProcessing ? "processing" : "risky";
  }
  if (verificationStatus === "catch_all") return "risky";
  return verificationStatus || "risky";
}
