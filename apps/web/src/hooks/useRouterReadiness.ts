"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { routerApiFetch } from "@/lib/routerApi";

export type RouterReadiness = {
  terms: boolean;
  profile: boolean;
  payment: boolean;
  complete: boolean;
};

export function useRouterReadiness() {
  const { getToken } = useAuth();
  const [readiness, setReadiness] = useState<RouterReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await routerApiFetch("/api/web/v4/readiness", getToken);
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const json = await resp.json().catch(() => null);
      const role = String(json?.role ?? "").toUpperCase();
      if (role !== "ROUTER") {
        setError("Not authenticated as a Router.");
        return;
      }
      const rc = json?.roleCompletion;
      setReadiness({
        terms: Boolean(rc?.terms),
        profile: Boolean(rc?.profile),
        payment: Boolean(rc?.payment),
        complete: Boolean(rc?.complete),
      });
      setError(null);
    } catch {
      setError("Failed to load readiness");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchReadiness();
  }, [fetchReadiness]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchReadiness();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchReadiness]);

  return { readiness, loading, error, refresh: fetchReadiness };
}
