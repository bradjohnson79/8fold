"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/routerApi";

export type JobPosterReadiness = {
  terms: boolean;
  profile: boolean;
  payment: boolean;
  complete: boolean;
};

export function useJobPosterReadiness() {
  const { getToken } = useAuth();
  const [readiness, setReadiness] = useState<JobPosterReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/web/v4/readiness", getToken);
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const json = await resp.json().catch(() => null);
      const role = String(json?.role ?? "").toUpperCase();
      if (role !== "JOB_POSTER") {
        setError("Not authenticated as a Job Poster.");
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
