"use client";

import * as React from "react";

export type RouterSessionState = "TERMS_REQUIRED" | "PROFILE_REQUIRED" | "READY";

export type RouterSessionData = {
  hasAcceptedTerms: boolean;
  profileComplete: boolean;
  missingFields: string[];
  state: RouterSessionState;
};

type RouterSessionResp =
  | { ok: true; data: RouterSessionData }
  | { ok: false; error: string };

export function useRouterSession(): {
  loading: boolean;
  session: RouterSessionData | null;
  error: string;
  refetch: () => void;
} {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<RouterSessionData | null>(null);
  const [error, setError] = React.useState("");
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch("/api/app/router/session", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as RouterSessionResp | null;
        if (cancelled) return;
        if (!resp.ok || !json || (json as any).ok !== true) {
          setSession(null);
          setError(typeof (json as any)?.error === "string" ? String((json as any).error) : "Failed to load session");
          return;
        }
        setSession((json as any).data as RouterSessionData);
      } catch (e) {
        if (cancelled) return;
        setSession(null);
        setError(e instanceof Error ? e.message : "Failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { loading, session, error, refetch: () => setNonce((n) => n + 1) };
}

