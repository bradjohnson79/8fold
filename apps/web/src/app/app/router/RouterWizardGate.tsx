"use client";

import React from "react";
import { useRouterSession } from "@/lib/useRouterSession";
import { RouterTermsClient } from "./RouterTermsClient";
import RouterProfileClient from "./profile/RouterProfileClient";

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
    return <RouterProfileClient onComplete={refetch} />;
  }

  // READY
  return <>{props.children}</>;
}

