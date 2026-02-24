import { redirect } from "next/navigation";
import { ContractorDashboardShell } from "../../../../components/roleShells/ContractorDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { apiFetch } from "@/server/api/apiClient";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { requireApiToken } from "@/server/auth/requireSession";
import { TopRightLogout } from "@/components/TopRightLogout";

export default async function ContractorAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (session?.role === "USER_ROLE_NOT_ASSIGNED" && session?.dbEnrichmentSucceeded === true) redirect("/onboarding/role");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/contractor");
    redirect("/app");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/contractor") redirect(root);

  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : null;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "";
    if (status === 401) redirect("/app");
    throw err;
  }

  const statusResp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken: token });
  const statusJson = (await statusResp.json().catch(() => null)) as any;
  if (!statusResp.ok || !statusJson) {
    if (statusResp.status === 401) redirect("/app");
    return (
      <ContractorDashboardShell>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-900">We couldn&apos;t load your contractor status right now.</div>
          <div className="mt-2">
            <a
              href="/app/contractor"
              className="inline-flex rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Retry
            </a>
          </div>
        </div>
      </ContractorDashboardShell>
    );
  }
  const ready = Boolean(statusJson?.contractorReady);

  return (
    <ContractorDashboardShell>
      <TopRightLogout />
      {!ready && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
          <h3 className="text-base font-semibold text-amber-900">Complete Your Contractor Setup</h3>
          <a
            href="/contractor/setup"
            className="mt-3 inline-flex rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Go to Setup
          </a>
        </div>
      )}
      {children}
    </ContractorDashboardShell>
  );
}

