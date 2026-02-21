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
  queueTextSave: (fieldKey: string, value: unknown) => void;
  blurFieldSave: (fieldKey: string, value: unknown) => Promise<boolean>;
  getFieldSaveState: (fieldKey: string) => "idle" | "saving" | "saved" | "error";
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
  const textDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const latestDraftRef = useRef<DraftV2 | null>(null);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

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
      for (const timer of textDebounceTimers.current.values()) {
        clearTimeout(timer);
      }
      textDebounceTimers.current.clear();
    };
  }, [load]);

  const dismissVersionBanner = useCallback(() => setVersionConflictBanner(false), []);

  const saveFieldInternal = useCallback(
    async (fieldKey: string, value: unknown, draftSnapshot: DraftV2): Promise<boolean> => {
      setPendingSaves((prev) => new Set(prev).add(fieldKey));
      try {
        const resp = await fetch("/api/app/job-poster/drafts-v2/save-field", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draftId: draftSnapshot.id,
            expectedVersion: draftSnapshot.version,
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
    []
  );

  const saveField = useCallback(
    async (fieldKey: string, value: unknown): Promise<boolean> => {
      const snapshot = latestDraftRef.current;
      if (!snapshot) return false;
      return saveFieldInternal(fieldKey, value, snapshot);
    },
    [saveFieldInternal]
  );

  const queueTextSave = useCallback(
    (fieldKey: string, value: unknown) => {
      const existing = textDebounceTimers.current.get(fieldKey);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        void saveField(fieldKey, value);
        textDebounceTimers.current.delete(fieldKey);
      }, 750);
      textDebounceTimers.current.set(fieldKey, timer);
    },
    [saveField]
  );

  const blurFieldSave = useCallback(
    async (fieldKey: string, value: unknown): Promise<boolean> => {
      const existing = textDebounceTimers.current.get(fieldKey);
      if (existing) {
        clearTimeout(existing);
        textDebounceTimers.current.delete(fieldKey);
      }
      return saveField(fieldKey, value);
    },
    [saveField]
  );

  const getFieldSaveState = useCallback(
    (fieldKey: string): "idle" | "saving" | "saved" | "error" => {
      if (pendingSaves.has(fieldKey)) return "saving";
      const serverState = draft?.fieldStates?.[fieldKey]?.status;
      if (serverState === "saved") return "saved";
      if (serverState === "error") return "error";
      return "idle";
    },
    [draft?.fieldStates, pendingSaves]
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
    queueTextSave,
    blurFieldSave,
    getFieldSaveState,
    advanceStep,
    startAppraisal,
    createPaymentIntent,
    reload: load,
    dismissVersionBanner,
  };
}
