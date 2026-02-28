"use client";

import React from "react";
import { useRouterSession } from "@/lib/useRouterSession";
import { RouterTermsClient } from "./RouterTermsClient";

export function RouterWizardGate(props: { children: React.ReactNode }) {
  const { loading, session, error, refetch } = useRouterSession();

  if (loading) {
    return <div className="text-sm text-gray-600">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || "Failed to load router session."}
      </div>
    );
  }

  if (session.state === "TERMS_REQUIRED") {
    return <RouterTermsClient onComplete={refetch} />;
  }

  if (session.state === "PROFILE_REQUIRED") {
    return (
      <div className="border border-amber-200 rounded-2xl p-6 bg-amber-50">
        <h2 className="text-lg font-bold text-gray-900">Profile required</h2>
        <p className="text-gray-600 mt-2">Complete your router profile to start routing jobs.</p>
        <a
          href="/dashboard/router/profile"
          className="mt-4 inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
        >
          Complete profile
        </a>
      </div>
    );
  }

  // READY
  return <>{props.children}</>;
}
