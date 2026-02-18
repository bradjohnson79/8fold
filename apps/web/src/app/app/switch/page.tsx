import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";

export default async function SwitchDashboardPage() {
  // Phase 8: one account → one root. This route is kept for backward compatibility,
  // but always redirects to the canonical dashboard root for the session role.
  const session = await requireServerSession();
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app");
    redirect("/app");
  }
  redirect(roleRootPath(session.role));
}

