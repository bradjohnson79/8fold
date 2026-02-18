import { redirect } from "next/navigation";
import { ContractorWaiverGate } from "../ContractorWaiverGate";
import { ContractorDashboardShell } from "../../../../components/roleShells/ContractorDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { apiFetch } from "@/server/api/apiClient";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { requireApiToken } from "@/server/auth/requireSession";

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
  if (session?.role === "USER_ROLE_NOT_ASSIGNED") redirect("/onboarding/role");
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
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[WEB AUTH] contractor layout token failure -> /app", { status, code });
    }
    if (status === 401) redirect("/app");
    throw err;
  }

  const statusResp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const statusJson = (await statusResp.json().catch(() => null)) as any;
  if (!statusResp.ok || !statusJson || (statusJson as any).ok !== true) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[WEB AUTH] contractor onboarding status failed", { status: statusResp.status });
    }
    if (statusResp.status === 401) redirect("/app");
    redirect("/login?next=/app/contractor");
  }

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

