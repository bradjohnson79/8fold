import { redirect } from "next/navigation";
import { JobPosterTosGate } from "./(app)/JobPosterTosGate";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { auth } from "@clerk/nextjs/server";

type TosStatus = {
  ok: true;
  agreementType: "JOB_POSTER_TOS";
  currentVersion: string;
  accepted: boolean;
  acceptedCurrent: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

export default async function JobPosterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (session?.role === "USER_ROLE_NOT_ASSIGNED" && session?.dbEnrichmentSucceeded === true) redirect("/onboarding/role");
  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) redirect("/login?next=/app/job-poster");
    redirect("/app");
  }
  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);
  const acceptedVersion = "1.0";
  const acceptedAt = null;
  const currentVersion = "1.0";
  const acceptedCurrent = true;
  const status: TosStatus = {
    ok: true,
    agreementType: "JOB_POSTER_TOS",
    currentVersion,
    accepted: true,
    acceptedCurrent,
    acceptedVersion,
    acceptedAt,
  };

  return (
    <JobPosterTosGate initialStatus={status}>
      {children}
    </JobPosterTosGate>
  );
}
