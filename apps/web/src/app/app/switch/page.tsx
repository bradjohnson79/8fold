import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";

export default async function SwitchDashboardPage() {
  // Phase 8: one account → one root. This route is kept for backward compatibility,
  // but always redirects to the canonical dashboard root for the session role.
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app");
  redirect(roleRootPath(session.role));
}

