import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { ContractorDashboardShell } from "../../../../components/roleShells/ContractorDashboardShell";
import { auth } from "@clerk/nextjs/server";

export default async function ContractorSetupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();

  if (!session) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/contractor");
    redirect("/app");
  }
  if (session.role === "USER_ROLE_NOT_ASSIGNED" && session.dbEnrichmentSucceeded === true) redirect("/onboarding/role");
  const root = roleRootPath(session.role);
  if (root !== "/app/contractor") redirect(root);

  return <ContractorDashboardShell>{children}</ContractorDashboardShell>;
}

