import { redirect } from "next/navigation";
import { getCurrentUserState } from "@/lib/auth/getCurrentUserState";
import { DashboardSetupClient } from "./setupClient";
import { RouterSetupClient } from "./RouterSetupClient";

export default async function DashboardSetupPage() {
  const state = await getCurrentUserState();
  if (!state) redirect("/login?next=/dashboard");
  if (!state.role) redirect("/auth/complete-registration");
  if (state.role === "ADMIN") redirect("/admin");

  if (state.role === "ROUTER") {
    return <RouterSetupClient />;
  }

  if (state.role === "CONTRACTOR") {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-2xl font-bold text-gray-900">Contractor Setup</h1>
          <p className="mt-2 text-sm text-gray-600">
            Contractor setup is optional here. Use the dedicated setup page any time to review terms and profile details.
          </p>
          <div className="mt-4 flex gap-3">
            <a
              href="/contractor/setup"
              className="inline-flex rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
            >
              Open Contractor Setup
            </a>
            <a
              href="/dashboard/contractor"
              className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <DashboardSetupClient />;
}
