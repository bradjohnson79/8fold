import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";
import { requireServerSession } from "@/server/auth/requireServerSession";

type CanonicalRole = "JOB_POSTER" | "CONTRACTOR" | "ROUTER" | "ADMIN";
type RoleSlug = "job-poster" | "contractor" | "router" | "admin";

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
    };
  }

  if (role === "ADMIN") {
    return {
      role,
      roleSlug: ROLE_TO_SLUG[role],
      acceptedTos: true,
      profileComplete: true,
    };
  }

  let profileComplete = false;
  let acceptedTos = false;
  try {
    const sessionToken = await requireApiToken();
    if (role === "JOB_POSTER") {
      const posterResp = await apiFetch({ path: "/api/web/v4/job-poster/readiness", method: "GET", sessionToken });
      const posterJson = (await posterResp.json().catch(() => null)) as any;
      if (posterResp.ok && posterJson) {
        profileComplete = Boolean(posterJson.profileComplete) && Boolean(posterJson.mapComplete);
        acceptedTos = Boolean(posterJson.tosAccepted);
      }
    } else {
      const resp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken });
      const json = (await resp.json().catch(() => null)) as any;
      if (resp.ok && json) {
        if (role === "CONTRACTOR") {
          profileComplete = Boolean(json.contractorReady);
          acceptedTos = Boolean(json.contractorAcceptedTos);
        } else if (role === "ROUTER") {
          profileComplete = Boolean(json.routerReady);
          acceptedTos = profileComplete;
        }
      }
    }
  } catch {
    profileComplete = false;
    acceptedTos = false;
  }

  return {
    role,
    roleSlug: ROLE_TO_SLUG[role],
    acceptedTos,
    profileComplete,
  };
}
