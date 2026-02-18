import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { RouterDashboardLayoutClient } from "./RouterDashboardLayoutClient";

export default async function RouterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (session?.role === "USER_ROLE_NOT_ASSIGNED") redirect("/onboarding/role");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/router");
    // Token/session is stabilizing; keep the user in the /app stabilization zone.
    redirect("/app");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/router") redirect(root);

  return <RouterDashboardLayoutClient>{children}</RouterDashboardLayoutClient>;
}

