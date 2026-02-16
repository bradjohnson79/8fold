import Link from "next/link";
import { OnboardingProgressBar } from "@/components/onboarding/OnboardingProgressBar";

export function RouterActivationPanel({
  status,
}: {
  status: {
    role: string;
    steps: { tos: { ok: boolean }; profile: { ok: boolean; missingFields?: string[] }; verified: { ok: boolean; reason?: string } };
    router?: { provisioned: boolean; active: boolean; termsAccepted: boolean; profileComplete: boolean };
  };
}) {
  const reason = String(status.steps.verified.reason ?? "");
  const heading =
    reason === "ROUTER_NOT_ACTIVE"
      ? "Router activation required"
      : reason === "ROUTER_NOT_PROVISIONED"
        ? "Router provisioning required"
        : "Router setup required";

  return (
    <div className="space-y-4">
      <OnboardingProgressBar title="Router onboarding" steps={status.steps as any} />

      <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5">
        <div className="font-bold text-amber-900">{heading}</div>
        <div className="text-amber-900/80 mt-2 text-sm">
          Your account is authenticated, but Router access isn’t fully active yet. This is enforced by the API for safety.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/app/router/profile" className="border border-amber-200 bg-white rounded-xl p-4 hover:bg-amber-50">
            <div className="font-semibold text-gray-900">Complete router profile</div>
            <div className="text-sm text-gray-700 mt-1">Add the required fields to finish setup.</div>
          </Link>
          <a href="/support" className="border border-amber-200 bg-white rounded-xl p-4 hover:bg-amber-50">
            <div className="font-semibold text-gray-900">Contact support</div>
            <div className="text-sm text-gray-700 mt-1">If you believe this is incorrect, support can verify activation.</div>
          </a>
        </div>

        <div className="mt-4 text-xs text-amber-900/70">
          Status: provisioned={String(status.router?.provisioned ?? false)} active={String(status.router?.active ?? false)}
        </div>
      </div>
    </div>
  );
}

