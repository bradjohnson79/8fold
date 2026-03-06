"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

const ROUTER_TOS_VERSION = "v1.0";

type SessionData = {
  hasAcceptedTerms: boolean;
  profileComplete: boolean;
  state: string;
};

export default function RouterTermsPage() {
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
        const resp = await routerApiFetch("/api/web/v4/router/session", getToken);
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        const data: SessionData = json?.data ?? json ?? {};
        setAccepted(Boolean(data.hasAcceptedTerms));
      } catch {
        if (alive) setError("Failed to load terms status");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleAccept() {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const resp = await routerApiFetch("/api/web/v4/router/accept-tos", getToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, version: ROUTER_TOS_VERSION }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
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
        <h1 className="text-2xl font-bold text-slate-900">Router Terms &amp; Conditions</h1>
        <p className="mt-1 text-sm text-slate-600">
          Version {ROUTER_TOS_VERSION} — Review the terms below.
          {accepted
            ? " You have accepted these terms."
            : " You must accept these terms before routing jobs."}
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

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Router Terms &amp; Conditions ({ROUTER_TOS_VERSION})
        </h2>
        <div className="space-y-3">
          <p>
            By accepting these terms, you agree to act as a Router on the 8Fold platform
            and abide by all platform policies governing job routing, contractor engagement,
            and service quality standards.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              You agree to route jobs fairly and follow platform routing policies at all times.
            </li>
            <li>
              You will not share private user data, contractor details, or job information
              outside authorized channels.
            </li>
            <li>
              You will route jobs only to contractors who are eligible based on jurisdiction,
              trade category, and platform standing.
            </li>
            <li>
              You understand that routing commissions are calculated based on completed
              routed jobs according to current 8Fold commission policy.
            </li>
            <li>
              Abuse, fraud, or violation of platform policies may result in immediate
              removal from the Router program.
            </li>
            <li>
              8Fold reserves the right to update these terms. Continued use of Router
              tools after updates constitutes acceptance of revised terms.
            </li>
          </ul>
        </div>
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
              I have read and accept the <span className="font-semibold">Router Terms &amp; Conditions</span> (v{ROUTER_TOS_VERSION}).
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!checked || submitting}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Recording..." : "Accept Terms"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
