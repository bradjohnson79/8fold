import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { getWebOrigin } from "@/server/api/apiClient";
import { RewardsClient } from "./RewardsClient";
import { auth } from "@clerk/nextjs/server";

export default async function RouterRewardsPage() {
  const session = await requireServerSession();
  const routerCode = String(session?.userId ?? "").trim();
  if (!routerCode) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/router/rewards");
    redirect("/app");
  }

  const base = getWebOrigin();
  const referralLink = `${base}/r?ref=${encodeURIComponent(routerCode)}`;

  return <RewardsClient referralLink={referralLink} />;
}

