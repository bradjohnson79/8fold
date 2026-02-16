"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACTOR_WAIVER_SECTIONS,
  CONTRACTOR_WAIVER_TITLE,
  CONTRACTOR_WAIVER_VERSION
} from "../../../lib/contractorWaiverV1";

type WaiverStatus = {
  ok: true;
  agreementType: "CONTRACTOR_WAIVER";
  currentVersion: string;
  accepted: boolean;
  acceptedCurrent: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

export function ContractorWaiverGate({
  initialStatus,
  children
}: {
  initialStatus: WaiverStatus | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WaiverStatus | null>(initialStatus);
  const acceptedCurrent = Boolean(status?.acceptedCurrent);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const acceptedAtPretty = useMemo(() => {
    if (!status?.acceptedAt) return null;
    const d = new Date(status.acceptedAt);
    return Number.isNaN(d.getTime()) ? status.acceptedAt : d.toLocaleString();
  }, [status?.acceptedAt]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
  }, []);

  async function refreshStatus() {
    const resp = await fetch("/api/app/contractor/waiver", { cache: "no-store" });
    const json = (await resp.json().catch(() => null)) as WaiverStatus | null;
    if (json && (json as any).ok) setStatus(json);
  }

  async function accept() {
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/waiver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Could not record acceptance");
      // Route directly into profile setup; force fresh server state.
      router.replace("/app/contractor/profile");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record acceptance");
    } finally {
      setSubmitting(false);
    }
  }

  if (acceptedCurrent) {
    return (
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
            <span className="px-2 py-1 rounded-full bg-green-50 text-8fold-green border border-green-100">
              {CONTRACTOR_WAIVER_TITLE} v{CONTRACTOR_WAIVER_VERSION} accepted
            </span>
            {acceptedAtPretty ? <span className="text-gray-500">{acceptedAtPretty}</span> : null}
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-[70vh]">
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="text-xl font-bold text-gray-900">
              {CONTRACTOR_WAIVER_TITLE} (v{CONTRACTOR_WAIVER_VERSION})
            </div>
            <div className="text-gray-600 mt-1">
              You must read and accept this waiver before accessing Contractor features.
            </div>
          </div>

          <div
            ref={scrollRef}
            className="max-h-[55vh] overflow-y-auto px-6 py-5"
          >
            <div className="space-y-6">
              {CONTRACTOR_WAIVER_SECTIONS.map((s) => (
                <section key={s.heading}>
                  <div className="font-bold text-gray-900">{s.heading}</div>
                  <ul className="mt-2 space-y-2 text-gray-700 text-sm list-disc list-inside">
                    {s.body.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50">
            {error ? (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            ) : null}

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                disabled={submitting}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="text-sm text-gray-800">
                I have read and agree to the <span className="font-semibold">{CONTRACTOR_WAIVER_TITLE}</span> (v
                {CONTRACTOR_WAIVER_VERSION}).
              </div>
            </label>

            <button
              onClick={() => void accept()}
              disabled={!checked || submitting}
              className="mt-4 w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg"
            >
              {submitting ? "Recording acceptance…" : "Accept & continue"}
            </button>

            <div className="mt-3 text-xs text-gray-500">
              Acceptance is versioned and stored with a timestamp for audit purposes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

