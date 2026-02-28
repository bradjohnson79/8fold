import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";

function canonicalRolePath(roleSlug: string): string {
  if (roleSlug === "job-poster") return "/dashboard/job-poster";
  if (roleSlug === "contractor") return "/app/contractor";
  if (roleSlug === "router") return "/dashboard/router";
  if (roleSlug === "admin") return "/admin";
  return "/dashboard";
}

export default async function DashboardRolePage({ params }: { params: Promise<{ role: string }> }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (!state.role) redirect("/auth/complete-registration");

  const { role } = await params;
  if (role !== state.roleSlug) {
    redirect(`/dashboard/${state.roleSlug}`);
  }

  redirect(canonicalRolePath(role));
}
