export type MissingStep = "TERMS" | "PROFILE" | "PAYMENT";
export type CompletionRole = "JOB_POSTER" | "CONTRACTOR" | "ROUTER";

export function parseMissingSteps(payload: unknown): MissingStep[] | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== "object") return null;
  const errorObj = error as Record<string, unknown>;
  const code = String(errorObj.code ?? "").trim().toUpperCase();
  if (code !== "ACCOUNT_INCOMPLETE") return null;
  const details = errorObj.details;
  if (!details || typeof details !== "object") return [];
  const raw = (details as Record<string, unknown>).missing;
  if (!Array.isArray(raw)) return [];
  return raw.filter((step): step is MissingStep => step === "TERMS" || step === "PROFILE" || step === "PAYMENT");
}

export function stepLabel(step: MissingStep): string {
  if (step === "TERMS") return "Terms";
  if (step === "PROFILE") return "Profile Setup";
  return "Payment Setup";
}

export function stepHref(role: CompletionRole, step: MissingStep): string {
  if (step === "TERMS") {
    if (role === "CONTRACTOR") return "/dashboard/contractor";
    if (role === "ROUTER") return "/dashboard/router";
    return "/dashboard/job-poster";
  }
  if (step === "PROFILE") {
    if (role === "CONTRACTOR") return "/dashboard/contractor/profile";
    if (role === "ROUTER") return "/dashboard/router/profile";
    return "/dashboard/job-poster/profile";
  }
  if (role === "CONTRACTOR") return "/dashboard/contractor/payment";
  if (role === "ROUTER") return "/dashboard/router/payment";
  return "/dashboard/job-poster/payment";
}
