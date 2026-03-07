"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiFetch("/api/web/v4/readiness", getToken);
        if (resp.status === 401) {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = await resp.json().catch(() => null);
        if (!alive) return;
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
      } catch {
        if (alive) setError("Failed to load readiness");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken]);

  return { readiness, loading, error };
}
