import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";
import { requireServerSession } from "@/server/auth/requireServerSession";

type CanonicalRole = "JOB_POSTER" | "CONTRACTOR" | "ROUTER" | "ADMIN";
type RoleSlug = "job-poster" | "contractor" | "router" | "admin";
type CompletionStep = "TERMS" | "PROFILE" | "PAYMENT";
type RoleCompletion = {
  role: Exclude<CanonicalRole, "ADMIN">;
  terms: boolean;
  profile: boolean;
  payment: boolean;
  complete: boolean;
  missing: CompletionStep[];
};

const ROLE_TO_SLUG: Record<CanonicalRole, RoleSlug> = {
  JOB_POSTER: "job-poster",
  CONTRACTOR: "contractor",
  ROUTER: "router",
  ADMIN: "admin",
};

export type CurrentUserState = {
  role: CanonicalRole | null;
  roleSlug: RoleSlug | null;
  acceptedTos: boolean;
  profileComplete: boolean;
  paymentComplete: boolean;
  roleCompletion: RoleCompletion | null;
};

function normalizeRole(roleRaw: unknown): CanonicalRole | null {
  const role = String(roleRaw ?? "").trim().toUpperCase();
  if (role === "JOB_POSTER" || role === "CONTRACTOR" || role === "ROUTER" || role === "ADMIN") return role;
  return null;
}

export async function getCurrentUserState(): Promise<CurrentUserState | null> {
  const session = await requireServerSession();
  if (!session?.userId) return null;

  const role = normalizeRole(session.role);
  if (!role) {
    return {
      role: null,
      roleSlug: null,
      acceptedTos: false,
      profileComplete: false,
      paymentComplete: false,
      roleCompletion: null,
    };
  }

  if (role === "ADMIN") {
    return {
      role,
      roleSlug: ROLE_TO_SLUG[role],
      acceptedTos: true,
      profileComplete: true,
      paymentComplete: true,
      roleCompletion: null,
    };
  }

  let profileComplete = false;
  let acceptedTos = false;
  let paymentComplete = false;
  let roleCompletion: RoleCompletion | null = null;
  try {
    const sessionToken = await requireApiToken();
    const resp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken });
    const json = (await resp.json().catch(() => null)) as any;
    if (resp.ok && json) {
      const rc = json.roleCompletion;
      if (rc && typeof rc === "object") {
        roleCompletion = {
          role,
          terms: Boolean(rc.terms),
          profile: Boolean(rc.profile),
          payment: Boolean(rc.payment),
          complete: Boolean(rc.complete),
          missing: Array.isArray(rc.missing) ? rc.missing.filter((x: unknown) => x === "TERMS" || x === "PROFILE" || x === "PAYMENT") : [],
        };
        acceptedTos = roleCompletion.terms;
        profileComplete = roleCompletion.profile;
        paymentComplete = roleCompletion.payment;
      } else {
        // Legacy readiness fallback.
        if (role === "JOB_POSTER") {
          profileComplete = Boolean(json.jobPosterReady);
          acceptedTos = Boolean(json.jobPosterAcceptedTos);
          paymentComplete = Boolean(json.hasCompletedJobPosterPaymentSetup);
        } else if (role === "ROUTER") {
          profileComplete = Boolean(json.routerReady);
          acceptedTos = Boolean(json.routerAcceptedTos);
          paymentComplete = Boolean(json.hasCompletedRouterPaymentSetup);
        } else {
          profileComplete = Boolean(json.contractorReady);
          acceptedTos = Boolean(json.contractorAcceptedTos);
          paymentComplete = Boolean(json.hasCompletedContractorPaymentSetup);
        }
      }
    }
  } catch {
    profileComplete = false;
    acceptedTos = false;
    paymentComplete = false;
    roleCompletion = null;
  }

  return {
    role,
    roleSlug: ROLE_TO_SLUG[role],
    acceptedTos,
    profileComplete,
    paymentComplete,
    roleCompletion,
  };
}
