import { redirect } from "next/navigation";
import { JobPosterTosGate } from "./(app)/JobPosterTosGate";
import { JobPosterDashboardShell } from "../../../components/roleShells/JobPosterDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";
import { roleRootPath } from "@/server/routing/roleRouting";

type TosStatus = {
  ok: true;
  agreementType: "JOB_POSTER_TOS";
  currentVersion: string;
  accepted: boolean;
  acceptedCurrent: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

export default async function JobPosterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/job-poster");
  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const resp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as any;
  const tos = (resp.ok && json && (json as any).ok === true ? (json as any).steps?.tos : null) as any;
  const acceptedVersion = typeof tos?.acceptedVersion === "string" ? tos.acceptedVersion : null;
  const acceptedAt = typeof tos?.acceptedAt === "string" ? tos.acceptedAt : null;
  const currentVersion = typeof tos?.currentVersion === "string" ? tos.currentVersion : "1.0";
  const acceptedCurrent = Boolean(tos?.acceptedCurrent ?? tos?.ok);
  const status: TosStatus = {
    ok: true,
    agreementType: "JOB_POSTER_TOS",
    currentVersion,
    accepted: Boolean(acceptedVersion),
    acceptedCurrent,
    acceptedVersion,
    acceptedAt,
  };

  return (
    <JobPosterTosGate initialStatus={status}>
      <JobPosterDashboardShell>{children}</JobPosterDashboardShell>
    </JobPosterTosGate>
  );
}

