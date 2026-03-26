"use client";

import Link from "next/link";
import React from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";
import { readJsonResponse } from "@/components/dashboard/loadSection";

type DashboardRole = "JOB_POSTER" | "CONTRACTOR" | "ROUTER";
type CompletionStep = "TERMS" | "PROFILE" | "PAYMENT";
type ReadinessPayload = {
  role?: DashboardRole | null;
  roleCompletion?: {
    role?: DashboardRole;
    terms?: boolean;
    profile?: boolean;
    payment?: boolean;
    complete?: boolean;
    missing?: CompletionStep[];
  } | null;
};

type CardConfig = {
  key: CompletionStep;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
};

type CompletionState = {
  terms: boolean;
  profile: boolean;
  payment: boolean;
  complete: boolean;
};

function cardConfigs(role: DashboardRole): CardConfig[] {
  const termsHref =
    role === "CONTRACTOR"
      ? "/dashboard/contractor/terms"
      : role === "ROUTER"
        ? "/dashboard/router/terms"
        : "/dashboard/job-poster";
  const profileHref =
    role === "CONTRACTOR"
      ? "/dashboard/contractor/profile"
      : role === "ROUTER"
        ? "/dashboard/router/profile"
        : "/dashboard/job-poster/profile";
  const paymentHref =
    role === "CONTRACTOR"
      ? "/dashboard/contractor/payment"
      : role === "ROUTER"
        ? "/dashboard/router/payments"
        : "/dashboard/job-poster/payment";

  return [
    {
      key: "TERMS",
      title: "Terms",
      description: "Accept your role-specific Terms & Conditions.",
      ctaLabel: "Review & Accept",
      href: termsHref,
    },
    {
      key: "PROFILE",
      title: "Profile Setup",
      description: "Complete your profile information for routing and compliance.",
      ctaLabel: "Complete Profile",
      href: profileHref,
    },
    {
      key: "PAYMENT",
      title: "Payment Setup",
      description: "Connect Stripe to receive or process payments.",
      ctaLabel: "Connect Stripe",
      href: paymentHref,
    },
  ];
}

export function RoleCompletionPanel({
  role,
  completionState,
  loadingOverride,
}: {
  role: DashboardRole;
  completionState?: CompletionState | null;
  loadingOverride?: boolean;
}) {
  const { getToken } = useAuth();
  const controlled = completionState !== undefined || loadingOverride !== undefined;
  const [loading, setLoading] = React.useState(!controlled);
  const [missing, setMissing] = React.useState<CompletionStep[]>([]);

  const fetchReadiness = React.useCallback(async () => {
    if (controlled) return;
    try {
      const resp = role === "ROUTER"
        ? await routerApiFetch("/api/web/v4/readiness", getToken)
        : await fetch("/api/v4/readiness", { cache: "no-store", credentials: "include" });
      const json = await readJsonResponse<ReadinessPayload>(resp);
      const completion = json?.roleCompletion;
      if (!resp.ok || !completion || completion.complete) {
        setMissing([]);
        return;
      }
      const steps = Array.isArray(completion.missing) ? completion.missing : [];
      setMissing(steps.filter((step) => step === "TERMS" || step === "PROFILE" || step === "PAYMENT"));
    } catch {
      setMissing([]);
    } finally {
      setLoading(false);
    }
  }, [controlled, role, getToken]);

  React.useEffect(() => {
    if (controlled) return;
    void fetchReadiness();
  }, [controlled, fetchReadiness]);

  React.useEffect(() => {
    if (controlled) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchReadiness();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [controlled, fetchReadiness]);

  React.useEffect(() => {
    if (!controlled) return;
    const effectiveLoading = loadingOverride ?? false;
    setLoading(effectiveLoading);
    if (effectiveLoading || !completionState || completionState.complete) {
      setMissing([]);
      return;
    }

    const nextMissing: CompletionStep[] = [];
    if (!completionState.terms) nextMissing.push("TERMS");
    if (!completionState.profile) nextMissing.push("PROFILE");
    if (!completionState.payment) nextMissing.push("PAYMENT");
    setMissing(nextMissing);
  }, [completionState, controlled, loadingOverride]);

  if (loading || missing.length === 0) return null;

  const cards = cardConfigs(role).filter((card) => missing.includes(card.key));
  if (cards.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-amber-900">Complete Your Setup</h2>
        <p className="text-sm text-amber-800">Finish the remaining steps to unlock all account actions.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="rounded-xl border border-amber-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{card.title}</h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Incomplete</span>
            </div>
            <p className="text-sm text-slate-600">{card.description}</p>
            <Link
              href={card.href}
              className="mt-3 inline-flex rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {card.ctaLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
