import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";

export default async function AppIndex() {
  const session = await requireServerSession();
  if (!session) redirect("/login?next=/app");
  redirect(roleRootPath(session.role));
}

