export function normalizeRole(roleRaw: unknown): string {
  return String(roleRaw ?? "").trim().toUpperCase();
}

export function roleRootPath(roleRaw: unknown): string {
  const role = normalizeRole(roleRaw);
  if (role === "ROUTER") return "/app/router";
  if (role === "CONTRACTOR") return "/app/contractor";
  if (role === "ADMIN") return "/admin";
  if (role === "JOB_POSTER") return "/app/job-poster";
  return "/forbidden";
}

export function roleOnboardingPath(roleRaw: unknown): string {
  const role = normalizeRole(roleRaw);
  if (role === "ROUTER") return "/app/router";
  if (role === "CONTRACTOR") return "/app/contractor/profile";
  if (role === "ADMIN") return "/admin";
  return "/app/job-poster/onboarding";
}

