import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/meSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";
import { TokenPendingClient } from "./TokenPendingClient";

export default async function AppIndex() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/login?next=/app");

  const session = await requireServerSession();
  if (!session) {
    return <TokenPendingClient nextFallback="/app" />;
  }
  if (session.role === "USER_ROLE_NOT_ASSIGNED" && session.dbEnrichmentSucceeded === true) redirect("/onboarding/role");
  redirect(roleRootPath(session.role));
}

