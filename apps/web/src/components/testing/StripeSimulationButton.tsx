"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Props = {
  onSuccess?: () => void | Promise<void>;
};

/**
 * Shared Stripe simulation button for testing.
 * Calls POST /api/web/v4/setup/simulate-stripe with the current user's auth token.
 * The backend automatically determines the user's role and applies the correct simulation.
 * Remove before production launch.
 */
export default function StripeSimulationButton({ onSuccess }: Props) {
  const { getToken } = useAuth();
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimulate() {
    if (simulating) return;
    setSimulating(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/setup/simulate-stripe", getToken, { method: "POST" });
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error ?? "Simulation failed");
      }
      await onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void handleSimulate()}
        disabled={simulating}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {simulating ? "Simulating..." : "Stripe Simulation Successful"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
