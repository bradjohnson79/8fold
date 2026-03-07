"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";
import {
  JOB_POSTER_TOS_SECTIONS,
  JOB_POSTER_TOS_TITLE,
  JOB_POSTER_TOS_VERSION,
} from "@/lib/jobPosterTosV1";

export default function JobPosterTermsPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiFetch("/api/web/v4/readiness", getToken);
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        setAccepted(Boolean(json?.hasAcceptedJobPosterTerms));
      } catch (e: unknown) {
        if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
        } else {
          if (alive) setError("Failed to load terms status");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [getToken]);

  async function handleAccept() {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const resp = await apiFetch("/api/web/v4/job-poster/accept-tos", getToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, version: JOB_POSTER_TOS_VERSION }),
      });
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          typeof json?.error === "string"
            ? json.error
            : json?.error?.message ?? "Failed to record acceptance",
        );
      }
      setAccepted(true);
      setSuccess("Terms accepted successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept terms");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-600">Loading terms...</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{JOB_POSTER_TOS_TITLE}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Version {JOB_POSTER_TOS_VERSION}
          {accepted
            ? ". You have accepted these terms."
            : ". You must accept these terms before posting jobs."}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      {accepted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="mr-2 text-emerald-600">&#10003;</span>
          <span className="text-sm font-medium text-emerald-800">Terms accepted</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-700">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          {JOB_POSTER_TOS_TITLE} (v{JOB_POSTER_TOS_VERSION})
        </h2>
        <p className="mb-4 text-slate-600">
          These Terms and Conditions govern your participation as a Job Poster on the 8Fold marketplace.
          By accepting these terms, you agree to post jobs and engage with Contractors and Routers in
          accordance with the rules below.
        </p>
        <p className="mb-6 text-slate-600">
          These policies ensure fairness for all marketplace participants and maintain platform integrity.
        </p>

        {JOB_POSTER_TOS_SECTIONS.map((section) => (
          <div key={section.heading} className="mb-5">
            <h3 className="mb-2 text-sm font-bold text-slate-900">{section.heading}</h3>
            <ul className="list-disc space-y-1 pl-5">
              {section.body.map((paragraph, i) => (
                <li key={i}>{paragraph}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!accepted ? (
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              disabled={submitting}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-slate-800">
              I have read and accept the <span className="font-semibold">{JOB_POSTER_TOS_TITLE}</span> (v{JOB_POSTER_TOS_VERSION}).
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!checked || submitting}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Recording..." : "Accept Terms & Continue"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
