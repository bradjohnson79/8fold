import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/meSession";
import { auth } from "@clerk/nextjs/server";
import { TokenPendingClient } from "./TokenPendingClient";

export default async function AppIndex() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/login?next=/dashboard");

  const session = await requireServerSession();
  if (!session) {
    return <TokenPendingClient nextFallback="/dashboard" />;
  }
  redirect("/dashboard");
}
