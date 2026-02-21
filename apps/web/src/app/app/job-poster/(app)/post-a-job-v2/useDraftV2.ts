"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

export type DraftV2 = {
  id: string;
  version: number;
  currentStep: string;
  countryCode: string;
  stateCode: string;
  data: Record<string, unknown>;
  validation: Record<string, unknown>;
  fieldStates: Record<string, { status: string; savedAt: string | null }>;
  lastSavedAt: string | null;
  jobId?: string | null;
  paymentIntentId?: string | null;
};

type UseDraftV2Result = {
  draft: DraftV2 | null;
  loading: boolean;
  error: string | null;
  versionConflictBanner: boolean;
  pendingSaves: Set<string>;
  saveField: (fieldKey: string, value: unknown) => Promise<boolean>;
  advanceStep: (targetStep: string) => Promise<boolean>;
  startAppraisal: () => Promise<boolean>;
  createPaymentIntent: () => Promise<{ clientSecret: string; returnUrl: string } | null>;
  reload: () => Promise<void>;
  dismissVersionBanner: () => void;
};

export function useDraftV2(): UseDraftV2Result {
  const [draft, setDraft] = useState<DraftV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionConflictBanner, setVersionConflictBanner] = useState(false);
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const resp = await fetch("/api/app/job-poster/drafts-v2/current", {
        signal: abortRef.current.signal,
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load draft");
      if (json?.success && json?.draft) {
        setDraft(json.draft);
      } else {
        throw new Error("Invalid response");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const dismissVersionBanner = useCallback(() => setVersionConflictBanner(false), []);

  const saveField = useCallback(
    async (fieldKey: string, value: unknown): Promise<boolean> => {
      if (!draft) return false;
      setPendingSaves((prev) => new Set(prev).add(fieldKey));
      try {
        const resp = await fetch("/api/app/job-poster/drafts-v2/save-field", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draftId: draft.id,
            expectedVersion: draft.version,
            fieldKey,
            value,
          }),
          credentials: "include",
        });
        const json = await resp.json().catch(() => null);
        if (resp.status === 409 && json?.code === "VERSION_CONFLICT" && json?.draft) {
          setDraft(json.draft);
          setVersionConflictBanner(true);
          setPendingSaves(new Set());
          return false;
        }
        if (!resp.ok || !json?.success) return false;
        if (json?.draft) setDraft(json.draft);
        return true;
      } finally {
        setPendingSaves((prev) => {
          const next = new Set(prev);
          next.delete(fieldKey);
          return next;
        });
      }
    },
    [draft]
  );

  const advanceStep = useCallback(
    async (targetStep: string): Promise<boolean> => {
      if (!draft) return false;
      if (pendingSaves.size > 0) return false;
      try {
        const resp = await fetch("/api/app/job-poster/drafts-v2/advance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draftId: draft.id,
            expectedVersion: draft.version,
            targetStep,
          }),
          credentials: "include",
        });
        const json = await resp.json().catch(() => null);
        if (resp.status === 409 && json?.code === "VERSION_CONFLICT" && json?.draft) {
          setDraft(json.draft);
          setVersionConflictBanner(true);
          return false;
        }
        if (!resp.ok || !json?.success) return false;
        if (json?.draft) setDraft(json.draft);
        return true;
      } catch {
        return false;
      }
    },
    [draft, pendingSaves.size]
  );

  const startAppraisal = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    try {
      const resp = await fetch("/api/app/job-poster/drafts-v2/start-appraisal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          expectedVersion: draft.version,
        }),
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (resp.status === 409 && json?.code === "VERSION_CONFLICT" && json?.draft) {
        setDraft(json.draft);
        setVersionConflictBanner(true);
        return false;
      }
      if (!resp.ok || !json?.success) return false;
      if (json?.draft) setDraft(json.draft);
      return true;
    } catch {
      return false;
    }
  }, [draft]);

  const createPaymentIntent = useCallback(async (): Promise<{ clientSecret: string; returnUrl: string } | null> => {
    if (!draft) return null;
    try {
      const resp = await fetch("/api/app/job-poster/drafts-v2/create-payment-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          expectedVersion: draft.version,
        }),
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) return null;
      return { clientSecret: json.clientSecret, returnUrl: json.returnUrl };
    } catch {
      return null;
    }
  }, [draft]);

  return {
    draft,
    loading,
    error,
    versionConflictBanner,
    pendingSaves,
    saveField,
    advanceStep,
    startAppraisal,
    createPaymentIntent,
    reload: load,
    dismissVersionBanner,
  };
}
