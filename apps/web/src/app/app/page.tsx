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
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[WEB AUTH] /app session missing; treating as token pending", { hasClerkUserId: true });
    }
    return <TokenPendingClient nextFallback="/app" />;
  }
  if (session.role === "USER_ROLE_NOT_ASSIGNED") redirect("/onboarding/role");
  redirect(roleRootPath(session.role));
}

