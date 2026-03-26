import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { RouterDashboardShell } from "@/components/roleShells/RouterDashboardShell";

export default async function RouterDashboardLayout({ children }: { children: React.ReactNode }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (state.role !== "ROUTER") redirect("/dashboard");

  return (
    <RouterDashboardShell>
      {children}
    </RouterDashboardShell>
  );
}
