"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResp =
  | {
      ok: true;
      hasContractor: boolean;
      active: null | {
        job: { id: string; title: string; region: string; status: string };
        estimate: {
          estimatedCompletionDate: string | null;
          setAt: string | null;
          updatedAt: string | null;
          updateReason: string | null;
          updateOtherText: string | null;
        };
        rules: { canSet: boolean; canUpdateOnce: boolean };
        badges: { completionDateReached: boolean };
      };
    }
  | { error: string };

type UpdateReason = "AWAITING_PARTS_MATERIALS" | "SCOPE_EXPANDED" | "SCHEDULING_DELAY" | "OTHER";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EstimatedCompletionCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResp | null>(null);

  const [date, setDate] = useState("");
  const [updateReason, setUpdateReason] = useState<UpdateReason>("AWAITING_PARTS_MATERIALS");
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/estimated-completion", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ApiResp;
      if (!resp.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load");
      setData(json);

      const current = (json as any)?.active?.estimate?.estimatedCompletionDate ?? "";
      setDate((prev) => prev || current || todayIso());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const active = data && "ok" in data ? data.active : null;
  const rules = active?.rules;

  const mode = useMemo(() => {
    if (!active) return "none";
    if (rules?.canSet) return "set";
    if (rules?.canUpdateOnce) return "update";
    return "view";
  }, [active, rules?.canSet, rules?.canUpdateOnce]);

  const canSubmit = useMemo(() => {
    if (!active?.job?.id) return false;
    if (!date) return false;
    if (submitting) return false;
    if (mode === "set") return true;
    if (mode === "update") {
      if (!updateReason) return false;
      if (updateReason === "OTHER" && !otherText.trim()) return false;
      return true;
    }
    return false;
  }, [active?.job?.id, date, submitting, mode, updateReason, otherText]);

  async function submit() {
    if (!active?.job?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const payload =
        mode === "update"
          ? { mode: "update", jobId: active.job.id, date, reason: updateReason, otherText: otherText.trim() || undefined }
          : { mode: "set", jobId: active.job.id, date };

      const resp = await fetch("/api/app/contractor/estimated-completion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to submit");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">Estimated Completion Date</h2>
            {active?.badges?.completionDateReached ? (
              <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-yellow-50 text-yellow-800 border-yellow-200">
                Completion Date Reached
              </span>
            ) : null}
          </div>
          <p className="text-gray-600 mt-1">
            This is a good-faith estimate to help everyone plan. It’s not a guarantee.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {!loading && data && "ok" in data && !data.hasContractor ? (
        <div className="mt-6 text-gray-700">No contractor profile found for this account.</div>
      ) : null}

      {!loading && data && "ok" in data && data.hasContractor && !active ? (
        <div className="mt-6 text-gray-700">No assigned jobs right now.</div>
      ) : null}

      {!loading && active ? (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Job:</span> {active.job.title}
          </div>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">Estimated Completion Date</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              disabled={mode === "view"}
            />
          </label>

          {mode === "update" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block md:col-span-1">
                <div className="text-sm font-medium text-gray-700">Reason (required)</div>
                <select
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value as UpdateReason)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="AWAITING_PARTS_MATERIALS">Awaiting parts/materials</option>
                  <option value="SCOPE_EXPANDED">Scope expanded</option>
                  <option value="SCHEDULING_DELAY">Scheduling delay</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <div className="text-sm font-medium text-gray-700">Other (if selected)</div>
                <input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Short description"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  disabled={updateReason !== "OTHER"}
                />
              </label>
            </div>
          ) : null}

          {mode === "set" || mode === "update" ? (
            <button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
            >
              {submitting ? "Saving…" : mode === "set" ? "Save estimate" : "Update estimate (one time)"}
            </button>
          ) : null}

          {mode === "view" ? (
            <div className="text-sm text-gray-600">
              Estimate is set{active.estimate.updatedAt ? " and has already been updated once." : "."}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

