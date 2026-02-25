import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { auth } from "@clerk/nextjs/server";

export default async function SwitchDashboardPage() {
  // Backward-compatible switch endpoint now funnels all users through unified /dashboard gating.
  const session = await requireServerSession();
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/dashboard");
    redirect("/dashboard");
  }
  redirect("/dashboard");
}
