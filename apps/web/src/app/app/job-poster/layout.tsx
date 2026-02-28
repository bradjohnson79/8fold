import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";

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

  // Legacy redirect: /app/job-poster → /dashboard/job-poster.
  redirect("/dashboard/job-poster");
}
