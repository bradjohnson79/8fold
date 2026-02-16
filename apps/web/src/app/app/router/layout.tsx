import { redirect } from "next/navigation";
import { RouterDashboardShell } from "../../../components/roleShells/RouterDashboardShell";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";

export default async function RouterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/router");
  const root = roleRootPath(session.role);
  if (root !== "/app/router") redirect(root);
  return <RouterDashboardShell>{children}</RouterDashboardShell>;
}

