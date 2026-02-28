import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { requireApiToken } from "@/server/auth/requireSession";
import { JobPosterDashboardShell } from "@/components/roleShells/JobPosterDashboardShell";

export default async function JobPosterAppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (session?.role === "USER_ROLE_NOT_ASSIGNED" && session?.dbEnrichmentSucceeded === true) redirect("/dashboard");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/job-poster");
    redirect("/app");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);

  try {
    await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : null;
    if (status === 401) redirect("/app");
    throw err;
  }

  return <JobPosterDashboardShell>{children}</JobPosterDashboardShell>;
}
