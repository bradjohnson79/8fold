"use client";

import * as React from "react";

export type MeSession = {
  ok?: boolean;
  role?: string;
  superuser?: boolean;
  router?: any;
  // Error envelopes
  error?: any;
  code?: string;
};

function extractCode(json: any): string {
  return String(json?.error?.code ?? json?.code ?? "");
}

export function useMeSession(): {
  loading: boolean;
  me: MeSession | null;
  code: string;
  retry: () => void;
} {
  const [loading, setLoading] = React.useState(true);
  const [me, setMe] = React.useState<MeSession | null>(null);
  const [code, setCode] = React.useState("");
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setCode("");

      const delaysMs = [0, 80, 160, 260, 420] as const; // <= ~1s
      for (let i = 0; i < delaysMs.length; i++) {
        if (cancelled) return;
        const delay = delaysMs[i]!;
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;

        const resp = await fetch("/api/app/me", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as any;
        if (cancelled) return;

        const c = extractCode(json);
        const pending =
          resp.status === 401 && (c === "AUTH_TOKEN_PENDING" || c === "AUTH_TOKEN_TIMEOUT" || c === "AUTH_SESSION_TIMEOUT");
        if (pending) {
          setMe(null);
          setCode(c || "AUTH_PENDING");
          continue;
        }

        setMe(resp.ok ? (json as MeSession) : (json as MeSession));
        setCode(c);
        setLoading(false);
        return;
      }

      // If we only ever saw pending auth, stay in loading=false with a code so callers can show CTA.
      setLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    loading,
    me,
    code,
    retry: () => setNonce((n) => n + 1),
  };
}

