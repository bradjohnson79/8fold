import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { RouterDashboardShell } from "@/components/roleShells/RouterDashboardShell";
import { UserButton } from "@clerk/nextjs";

export default async function RouterDashboardLayout({ children }: { children: React.ReactNode }) {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (state.role !== "ROUTER") redirect("/dashboard");
  if (!state.acceptedTos || !state.profileComplete) redirect("/dashboard/setup");

  return (
    <>
      <div className="fixed right-4 top-4 z-[2147483646]">
        <UserButton afterSignOutUrl="/" />
      </div>
      <RouterDashboardShell>{children}</RouterDashboardShell>
    </>
  );
}
