"use client";

import React from "react";

export type JobDraftStep = "DETAILS" | "PRICING" | "AVAILABILITY" | "PAYMENT" | "CONFIRMED";

type Draft = {
  id: string;
  step: JobDraftStep;
  status: "ACTIVE" | "ARCHIVED";
  data: Record<string, any>;
};

type AppraisalPayload = {
  min: number;
  median: number;
  max: number;
  step: number;
  blurb: string;
  model?: string;
};

function parseError(json: any, fallback: string) {
  return String(json?.message ?? json?.error ?? fallback);
}

export function useJobDraftV3() {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDraft = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/job-draft", { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(parseError(json, "Failed to load draft."));
      setDraft(json?.draft ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load draft.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDraft();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loadDraft]);

  const patchDraft = React.useCallback(
    async (payload: { step?: JobDraftStep; dataPatch?: Record<string, unknown> }) => {
      setSaving(true);
      setError("");
      try {
        const resp = await fetch("/api/job-draft", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(parseError(json, "Failed to save draft."));
        setDraft(json?.draft ?? null);
        return json?.draft as Draft;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save draft.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const autosavePatch = React.useCallback(
    (dataPatch: Record<string, unknown>, step?: JobDraftStep) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void patchDraft({ dataPatch, step });
      }, 350);
    },
    [patchDraft]
  );

  const appraise = React.useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/job-draft/appraise", {
        method: "POST",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(parseError(json, "Failed to appraise."));
      const appraisal = json?.appraisal as AppraisalPayload;
      await patchDraft({ dataPatch: { appraisal }, step: "PRICING" });
      return appraisal;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to appraise.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, [patchDraft]);

  const createPaymentIntent = React.useCallback(
    async (selectedPriceCents: number, isRegional: boolean) => {
      setSaving(true);
      setError("");
      try {
        const resp = await fetch("/api/job-draft/payment-intent", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selectedPrice: selectedPriceCents, isRegional }),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(parseError(json, "Failed to create payment intent."));
        await patchDraft({
          dataPatch: {
            payment: {
              paymentIntentId: json?.paymentIntentId,
            },
            pricing: {
              selectedPriceCents,
              isRegional,
              totalCents: json?.amount,
            },
          },
          step: "PAYMENT",
        });
        return json as { clientSecret: string; paymentIntentId: string; amount: number };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create payment intent.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [patchDraft]
  );

  const submit = React.useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/job-draft/submit", {
        method: "POST",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(parseError(json, "Failed to submit draft."));
      await patchDraft({ step: "CONFIRMED" });
      return json as { success: true; jobId: string };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit draft.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, [patchDraft]);

  return {
    draft,
    loading,
    saving,
    error,
    loadDraft,
    patchDraft,
    autosavePatch,
    appraise,
    createPaymentIntent,
    submit,
  };
}
