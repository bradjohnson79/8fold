import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";

export default async function ContractorSetupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();

  if (!session) {
    redirect("/login");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/contractor") redirect(root);

  return <>{children}</>;
}

