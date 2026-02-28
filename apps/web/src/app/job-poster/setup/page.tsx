import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { DashboardSetupClient } from "@/app/dashboard/setup/setupClient";

export default async function JobPosterSetupPage() {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/job-poster/setup");
  if (state.role !== "JOB_POSTER") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {state.roleCompletion?.complete ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Your setup is already complete. You can still review or update these details.
          <a href="/dashboard/job-poster" className="ml-2 font-semibold underline">
            Return to dashboard
          </a>
        </div>
      ) : null}
      <DashboardSetupClient />
    </div>
  );
}
