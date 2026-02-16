"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  JOB_POSTER_TOS_SECTIONS,
  JOB_POSTER_TOS_TITLE,
  JOB_POSTER_TOS_VERSION
} from "@/lib/jobPosterTosV1";

type TosStatus = {
  ok: true;
  agreementType: "JOB_POSTER_TOS";
  currentVersion: string;
  accepted: boolean;
  acceptedCurrent: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

export function JobPosterTosGate({
  initialStatus,
  children
}: {
  initialStatus: TosStatus | null;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<TosStatus | null>(initialStatus);
  const acceptedCurrent = Boolean(status?.acceptedCurrent);
  const isUpgrade = Boolean(status?.accepted) && !acceptedCurrent;

  // Acceptance UX
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const acceptedAtPretty = useMemo(() => {
    if (!status?.acceptedAt) return null;
    const d = new Date(status.acceptedAt);
    return Number.isNaN(d.getTime()) ? status.acceptedAt : d.toLocaleString();
  }, [status?.acceptedAt]);

  useEffect(() => {
    // Initialize scroll lock state (in case content fits).
    const el = scrollRef.current;
    if (!el) return;
    const fits = el.scrollHeight <= el.clientHeight + 2;
    if (fits) setScrolledToEnd(true);
  }, []);

  async function refreshStatus() {
    const resp = await fetch("/api/app/job-poster/tos", { cache: "no-store" });
    const json = (await resp.json().catch(() => null)) as TosStatus | null;
    if (json && (json as any).ok) setStatus(json);
  }

  async function accept() {
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/tos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, version: JOB_POSTER_TOS_VERSION })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Could not record acceptance");
      await refreshStatus();
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
              {JOB_POSTER_TOS_TITLE} v{JOB_POSTER_TOS_VERSION} accepted
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
      {/* Blocking modal overlay (cannot be dismissed) */}
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="text-xl font-bold text-gray-900">
              {JOB_POSTER_TOS_TITLE} (v{JOB_POSTER_TOS_VERSION})
            </div>
            <div className="text-gray-600 mt-1">
              {isUpgrade
                ? "The terms have been updated. Please review and accept the latest version to continue."
                : "You must read and accept these terms before accessing the Job Poster dashboard."}
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={() => {
              const el = scrollRef.current;
              if (!el) return;
              const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
              if (atEnd) setScrolledToEnd(true);
            }}
            className="max-h-[55vh] overflow-y-auto px-6 py-5"
          >
            <div className="space-y-6">
              {JOB_POSTER_TOS_SECTIONS.map((s) => (
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

            {!scrolledToEnd ? (
              <div className="mt-6 text-sm text-gray-600">
                Scroll to the bottom to enable acceptance.
              </div>
            ) : null}
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
                disabled={!scrolledToEnd || submitting}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="text-sm text-gray-800">
                I have read and agree to the <span className="font-semibold">{JOB_POSTER_TOS_TITLE}</span> (v
                {JOB_POSTER_TOS_VERSION}).
              </div>
            </label>

            <button
              onClick={() => void accept()}
              disabled={!scrolledToEnd || !checked || submitting}
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

      {/* Keep children mounted behind the modal? No — do not render dashboard content until accepted */}
    </div>
  );
}

