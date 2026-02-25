import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";

export default async function DashboardEntryPage() {
  const state = await getCurrentUserState();

  if (!state) {
    redirect("/login?next=/dashboard");
  }

  if (!state.role) {
    redirect("/auth/complete-registration");
  }

  if (!state.acceptedTos || !state.profileComplete) {
    redirect("/dashboard/setup");
  }

  redirect(`/dashboard/${state.roleSlug}`);
}
