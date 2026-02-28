import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { RoleCompletionPanel } from "@/components/dashboard/RoleCompletionPanel";
import { JobPosterDashboardShell } from "@/components/roleShells/JobPosterDashboardShell";
export default async function JobPosterDashboardLayout({ children }: { children: React.ReactNode }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (state.role !== "JOB_POSTER") redirect("/dashboard");

  return (
    <JobPosterDashboardShell>
      <RoleCompletionPanel role="JOB_POSTER" />
      {children}
    </JobPosterDashboardShell>
  );
}
