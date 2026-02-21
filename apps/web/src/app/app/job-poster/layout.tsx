import { redirect } from "next/navigation";
import { JobPosterTosGate } from "./(app)/JobPosterTosGate";
import { JobPosterDashboardShell } from "../../../components/roleShells/JobPosterDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { apiFetch } from "@/server/api/apiClient";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { requireApiToken } from "@/server/auth/requireSession";

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
  if (session?.role === "USER_ROLE_NOT_ASSIGNED" && session?.dbEnrichmentSucceeded === true) redirect("/onboarding/role");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/job-poster");
    redirect("/app");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);

  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : null;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "";
    if (status === 401) redirect("/app");
    throw err;
  }
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

