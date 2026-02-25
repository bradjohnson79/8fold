import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";

function roleSetupPath(role: string): string {
  if (role === "JOB_POSTER") return "/job-poster/setup";
  if (role === "CONTRACTOR") return "/contractor/setup";
  if (role === "ROUTER") return "/router/setup";
  if (role === "ADMIN") return "/admin";
  return "/auth/complete-registration";
}

export default async function DashboardSetupPage() {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (!state.role) redirect("/auth/complete-registration");

  if (state.acceptedTos && state.profileComplete) {
    redirect(`/dashboard/${state.roleSlug}`);
  }

  redirect(roleSetupPath(state.role));
}
