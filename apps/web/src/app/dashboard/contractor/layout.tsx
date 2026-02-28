import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { RoleCompletionPanel } from "@/components/dashboard/RoleCompletionPanel";
import { ContractorDashboardShellV4 } from "@/components/roleShells/ContractorDashboardShellV4";

export default async function ContractorDashboardLayout({ children }: { children: React.ReactNode }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (state.role !== "CONTRACTOR") redirect("/dashboard");

  return (
    <ContractorDashboardShellV4>
      <RoleCompletionPanel role="CONTRACTOR" />
      {children}
    </ContractorDashboardShellV4>
  );
}
