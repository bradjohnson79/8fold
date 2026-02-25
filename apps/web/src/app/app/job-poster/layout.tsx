import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

export default async function JobPosterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (session?.role === "USER_ROLE_NOT_ASSIGNED" && session?.dbEnrichmentSucceeded === true) redirect("/dashboard");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/job-poster");
    redirect("/app");
  }

  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);

  // Legacy redirect: /app/job-poster → /dashboard/job-poster (server-side, role-gated)
  redirect("/dashboard/job-poster");

  try {
    const token = await requireApiToken();
    const tosResp = await apiFetch({ path: "/api/web/job-poster-tos", method: "GET", sessionToken: token });
    const tosJson = (await tosResp.json().catch(() => null)) as any;
    if (!tosResp.ok || tosJson?.acceptedCurrent !== true) {
      redirect("/dashboard/setup");
    }
  } catch {
    redirect("/dashboard/setup");
  }

  return <>{children}</>;
}
