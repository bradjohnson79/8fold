import { requireServerSession } from "@/server/auth/requireServerSession";
import { getWebOrigin } from "@/server/api/apiClient";
import { RewardsClient } from "./RewardsClient";

export default async function RouterRewardsPage() {
  const session = await requireServerSession();
  const routerCode = String(session?.userId ?? "").trim();

  const base = getWebOrigin();
  const referralLink = `${base}/r?ref=${encodeURIComponent(routerCode)}`;

  return <RewardsClient referralLink={referralLink} />;
}

