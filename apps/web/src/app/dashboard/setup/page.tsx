import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { DashboardSetupClient } from "./setupClient";

export default async function DashboardSetupPage() {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (!state.role) redirect("/auth/complete-registration");

  if (state.role === "JOB_POSTER" && state.acceptedTos && state.profileComplete) {
    redirect("/dashboard/job-poster");
  }

  if (state.acceptedTos && state.profileComplete) {
    redirect(`/dashboard/${state.roleSlug}`);
  }

  if (state.role !== "JOB_POSTER") {
    if (state.role === "CONTRACTOR") redirect("/contractor/setup");
    if (state.role === "ROUTER") redirect("/router/setup");
    if (state.role === "ADMIN") redirect("/admin");
  }

  return <DashboardSetupClient />;
}
