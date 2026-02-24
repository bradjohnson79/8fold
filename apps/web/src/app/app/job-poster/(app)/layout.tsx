import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";
import { JobPosterDashboardShell } from "@/components/roleShells/JobPosterDashboardShell";
import { FullScreenSetupGate } from "@/components/FullScreenSetupGate";

export default async function JobPosterAppGroupLayout({ children }: { children: React.ReactNode }) {
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
    if (status === 401) redirect("/app");
    throw err;
  }

  let ready = false;
  try {
    const resp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    ready = Boolean(resp.ok && json?.jobPosterReady === true);
  } catch {
    ready = false;
  }

  if (!ready) return <FullScreenSetupGate />;

  return <JobPosterDashboardShell>{children}</JobPosterDashboardShell>;
}
