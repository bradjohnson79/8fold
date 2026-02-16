import { redirect } from "next/navigation";
import { RouterTermsClient } from "./RouterTermsClient";
import { RouterCompletionCard } from "./RouterCompletionCard";
import { RouterActivationPanel } from "./RouterActivationPanel";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";

type OnboardingStatus = {
  ok: true;
  role: string;
  steps: {
    tos: { ok: boolean };
    profile: { ok: boolean; missingFields?: string[] };
    verified: { ok: boolean; reason?: string };
  };
  router?: { provisioned: boolean; active: boolean; termsAccepted: boolean; profileComplete: boolean };
};

export default async function RouterPage() {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/router");

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const resp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as OnboardingStatus | null;
  if (!resp.ok || !json || (json as any).ok !== true) redirect("/login?next=/app/router");

  // Activation / provisioning guard: never show raw 403s for router drift.
  if (!json.steps.verified.ok) {
    return <RouterActivationPanel status={json} />;
  }

  // Required behavior:
  // /app/router → terms if not accepted → profile if incomplete → dashboard when complete
  if (!json.steps.tos.ok) {
    return <RouterTermsClient />;
  }
  if (!json.steps.profile.ok) {
    redirect("/app/router/profile");
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Overview</h2>
      <p className="text-gray-600 mt-2">
        Use the routing tools to route open jobs in your region to eligible contractors.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/app/router/open-jobs" className="block border border-gray-200 rounded-2xl p-5 bg-white hover:bg-gray-50">
          <div className="font-bold text-gray-900">Open jobs in region</div>
          <div className="text-sm text-gray-600 mt-1">Select a job, then pick 1–5 contractors and route it.</div>
        </a>
        <a href="/app/router/queue" className="block border border-gray-200 rounded-2xl p-5 bg-white hover:bg-gray-50">
          <div className="font-bold text-gray-900">Routing queue</div>
          <div className="text-sm text-gray-600 mt-1">Track routed jobs, contractor counts, and time remaining.</div>
        </a>
      </div>

      <RouterCompletionCard />
    </>
  );
}

