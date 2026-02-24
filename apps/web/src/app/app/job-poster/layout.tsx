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
  const resp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as any;
  const acceptedVersion = "1.0";
  const acceptedAt = null;
  const currentVersion = "1.0";
  const acceptedCurrent = true;
  const ready = Boolean(resp.ok && json && (json as any).jobPosterReady === true);
  const status: TosStatus = {
    ok: true,
    agreementType: "JOB_POSTER_TOS",
    currentVersion,
    accepted: true,
    acceptedCurrent,
    acceptedVersion,
    acceptedAt,
  };

  return (
    <JobPosterTosGate initialStatus={status}>
      <JobPosterDashboardShell>
        {!ready && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
            <h3 className="text-base font-semibold text-amber-900">Complete Your Job Poster Setup</h3>
            <a
              href="/post-job"
              className="mt-3 inline-flex rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Go to Setup
            </a>
          </div>
        )}
        {children}
      </JobPosterDashboardShell>
    </JobPosterTosGate>
  );
}

