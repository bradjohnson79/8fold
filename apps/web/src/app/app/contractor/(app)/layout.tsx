import { redirect } from "next/navigation";
import { ContractorWaiverGate } from "../ContractorWaiverGate";
import { ContractorDashboardShell } from "../../../../components/roleShells/ContractorDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";
import { roleRootPath } from "@/server/routing/roleRouting";

type WaiverStatus = {
  ok: true;
  agreementType: "CONTRACTOR_WAIVER";
  currentVersion: string;
  accepted: boolean;
  acceptedCurrent: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

export default async function ContractorAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/contractor");
  const root = roleRootPath(session.role);
  if (root !== "/app/contractor") redirect(root);

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";

  const statusResp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const statusJson = (await statusResp.json().catch(() => null)) as any;
  if (!statusResp.ok || !statusJson || (statusJson as any).ok !== true) redirect("/login?next=/app/contractor");

  const steps = (statusJson as any).steps as any;
  const profileOk = Boolean(steps?.profile?.ok);
  const verifiedReason = String(steps?.verified?.reason ?? "");
  const denied = verifiedReason === "DENIED_INSUFFICIENT_EXPERIENCE";

  // Profile completion gate for all contractor app pages.
  if (!profileOk || denied) {
    redirect("/app/contractor/profile");
  }

  const tos = steps?.tos ?? {};
  const acceptedVersion = typeof tos?.acceptedVersion === "string" ? tos.acceptedVersion : null;
  const waiverStatus: WaiverStatus = {
    ok: true,
    agreementType: "CONTRACTOR_WAIVER",
    currentVersion: typeof tos?.currentVersion === "string" ? tos.currentVersion : "1.0",
    accepted: Boolean(acceptedVersion),
    acceptedCurrent: Boolean(tos?.acceptedCurrent ?? tos?.ok),
    acceptedVersion,
    acceptedAt: typeof tos?.acceptedAt === "string" ? tos.acceptedAt : null,
  };

  return (
    <ContractorWaiverGate initialStatus={waiverStatus}>
      <ContractorDashboardShell>{children}</ContractorDashboardShell>
    </ContractorWaiverGate>
  );
}

