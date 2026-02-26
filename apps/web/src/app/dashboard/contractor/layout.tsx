import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { ContractorDashboardShellV4 } from "@/components/roleShells/ContractorDashboardShellV4";

export default async function ContractorDashboardLayout({ children }: { children: React.ReactNode }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (state.role !== "CONTRACTOR") redirect("/dashboard");
  if (!state.acceptedTos || !state.profileComplete) redirect("/dashboard/setup");

  return <ContractorDashboardShellV4>{children}</ContractorDashboardShellV4>;
}
