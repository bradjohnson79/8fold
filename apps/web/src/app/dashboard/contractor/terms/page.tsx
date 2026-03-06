"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

const TOS_VERSION = "v1.0";

export default function ContractorTermsPage() {
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
        const resp = await apiFetch("/api/web/contractor-waiver", getToken);
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        setAccepted(Boolean(json?.hasAcceptedContractorTerms ?? json?.accepted));
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
      const resp = await apiFetch("/api/web/contractor-waiver", getToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, version: TOS_VERSION }),
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
        <h1 className="text-2xl font-bold text-slate-900">Contractor Terms &amp; Conditions</h1>
        <p className="mt-1 text-sm text-slate-600">
          Last Updated: March 6th, 2026 &mdash; Version {TOS_VERSION}
          {accepted
            ? ". You have accepted these terms."
            : ". You must accept these terms before receiving jobs."}
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

      {/* Suspension Policy Notice */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <span className="text-amber-500">&#9888;</span> Contractor Reliability Policy
        </h3>
        <div className="mt-2 space-y-3 text-sm text-amber-800">
          <p>
            In the event a job must be rescheduled or canceled, it must be reported before the 8 hour
            window of an appointment time. Failure to do so could result in a <strong>7 day account suspension</strong>.
          </p>
          <p>
            If an appointment is scheduled and the Contractor fails to appear for the assigned job,
            this could lead to a <strong>1 month account suspension</strong>.
          </p>
          <p>
            Suspension involves no access to a contractor&apos;s dashboard or assignment work available
            for the amount of suspension time. Please be considerate to your clients by reporting any
            need to reschedule or cancel within the appropriate window of time sanctioned by 8Fold.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-700">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          8Fold Contractor Terms &amp; Conditions ({TOS_VERSION})
        </h2>
        <p className="mb-4 text-slate-600">
          These Terms and Conditions govern participation in the 8Fold Contractor Network. By accepting
          these terms, you agree to provide services through the platform in accordance with the rules below.
        </p>
        <p className="mb-6 text-slate-600">
          These policies ensure fairness for Job Posters, Contractors, and Routers and maintain the
          integrity of the marketplace.
        </p>

        {/* 1. Contractor Responsibilities */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">1. Contractor Responsibilities</h3>
        <p className="mb-2">As a contractor on the 8Fold platform you agree to:</p>
        <ul className="mb-5 list-disc space-y-1 pl-5">
          <li>Provide services professionally and in good faith.</li>
          <li>Communicate clearly with job posters regarding scheduling and arrival times.</li>
          <li>Complete accepted work as agreed upon unless a valid cancellation occurs within the allowed window.</li>
          <li>Maintain accurate contact information and service region details in your profile.</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Contractors are independent service providers and are responsible for their own licensing, insurance,
          and tax obligations.
        </p>

        {/* 2. Appointment Scheduling */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">2. Appointment Scheduling</h3>
        <p className="mb-2">Once a job is accepted:</p>
        <ul className="mb-5 list-disc space-y-1 pl-5">
          <li>The contractor is responsible for contacting the job poster to confirm the appointment time.</li>
          <li>The contractor must arrive at the scheduled time or notify the job poster in advance if a delay occurs.</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Failure to manage appointments responsibly negatively affects the platform and may result in
          disciplinary action.
        </p>

        {/* 3. Cancellation Policy */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">3. Cancellation Policy</h3>
        <p className="mb-2">Contractors may cancel an accepted job only if proper notice is provided.</p>
        <p className="mb-1 font-semibold">Acceptable Cancellation Window</p>
        <p className="mb-2">
          A contractor may cancel a job more than 8 hours before the scheduled appointment time without penalty.
        </p>
        <p className="mb-1 font-semibold">Late Cancellation (Penalty)</p>
        <p className="mb-2">
          Canceling within 8 hours of the scheduled appointment time will result in: <strong>1 week account
          suspension</strong> from the platform.
        </p>
        <p className="mb-2">During suspension:</p>
        <ul className="mb-5 list-disc space-y-1 pl-5">
          <li>The contractor cannot login to use their dashboard and accept new jobs.</li>
          <li>Existing jobs must still be honored unless reassigned by 8Fold support.</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Repeated late cancellations may result in longer suspensions or permanent dismissal from 8Fold.
        </p>

        {/* 4. No-Show Policy */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">4. No-Show Policy</h3>
        <p className="mb-2">A No-Show occurs when a contractor:</p>
        <ul className="mb-2 list-disc space-y-1 pl-5">
          <li>Accepts a job</li>
          <li>Fails to attend the appointment</li>
          <li>Fails to contact the job poster before the scheduled time</li>
        </ul>
        <p className="mb-2">
          A confirmed No-Show will result in: <strong>1 month account suspension</strong> from the platform.
        </p>
        <p className="mb-6 text-xs text-slate-500">
          During suspension the contractor will be unable to receive or accept new job invitations. Repeated
          No-Shows may result in permanent removal from the platform.
        </p>

        {/* 5. Professional Conduct */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">5. Professional Conduct</h3>
        <p className="mb-2">
          Contractors must maintain respectful and professional conduct at all times.
          The following behavior is prohibited:
        </p>
        <ul className="mb-2 list-disc space-y-1 pl-5">
          <li>Harassment or abusive communication</li>
          <li>Discrimination of any kind</li>
          <li>Fraudulent job completion claims</li>
          <li>Misrepresentation of skills or services</li>
          <li>Attempting to bypass the 8Fold platform for payment</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Violation of these rules may result in immediate suspension or permanent account removal.
        </p>

        {/* 6. Payment Processing */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">6. Payment Processing</h3>
        <p className="mb-2">Payments are processed through Stripe Connect. Contractors must:</p>
        <ul className="mb-5 list-disc space-y-1 pl-5">
          <li>Complete Stripe onboarding</li>
          <li>Maintain a valid payout account</li>
          <li>Comply with Stripe identity verification requirements</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          8Fold does not hold contractor funds beyond standard payment processing timelines.
        </p>

        {/* 7. Platform Integrity */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">7. Platform Integrity</h3>
        <p className="mb-2">Contractors agree not to:</p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Manipulate reviews or ratings</li>
          <li>Accept jobs with the intention of canceling repeatedly</li>
          <li>Use multiple accounts to avoid suspension penalties</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Such activity may result in immediate removal from the platform.
        </p>

        {/* 8. Suspension & Enforcement */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">8. Suspension &amp; Enforcement</h3>
        <p className="mb-2">
          8Fold may suspend or restrict contractor accounts when necessary to maintain platform integrity.
          Examples include:
        </p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Late cancellations</li>
          <li>No-shows</li>
          <li>Repeated poor service reports</li>
          <li>Terms violations</li>
        </ul>

        {/* 9. Account Termination */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">9. Account Termination</h3>
        <p className="mb-2">
          8Fold reserves the right to permanently remove contractors from the platform for:
        </p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Repeated violations of these terms</li>
          <li>Fraudulent activity</li>
          <li>Abusive behavior toward customers or staff</li>
        </ul>

        {/* 10. Agreement */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">10. Agreement</h3>
        <p>By selecting &ldquo;Accept Terms&rdquo;, you confirm that:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>You understand these rules</li>
          <li>You agree to follow them</li>
          <li>You understand the suspension policies described above</li>
        </ul>
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
              I have read and accept the <span className="font-semibold">Contractor Terms &amp; Conditions</span> (v{TOS_VERSION}).
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
