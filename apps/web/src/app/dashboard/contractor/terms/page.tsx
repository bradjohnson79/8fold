"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

const TOS_VERSION = "v1.1";

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
        const resp = await apiFetch("/api/web/v4/contractor/accept-tos", getToken);
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        // Check whether the current version has been accepted via the readiness endpoint
        const readinessResp = await apiFetch("/api/web/v4/readiness", getToken);
        const readinessJson = await readinessResp.json().catch(() => null);
        if (!alive) return;
        setAccepted(Boolean(readinessJson?.terms));
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
      const resp = await apiFetch("/api/web/v4/contractor/accept-tos", getToken, {
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
          Last Updated: March 2026 &mdash; Version {TOS_VERSION}
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
          <span className="text-sm font-medium text-emerald-800">Terms accepted — Version {TOS_VERSION}</span>
        </div>
      ) : null}

      {/* Reliability Policy Notice */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <span className="text-amber-500">&#9888;</span> Contractor Reliability Policy
        </h3>
        <div className="mt-2 space-y-3 text-sm text-amber-800">
          <p>
            In the event a job must be rescheduled or canceled, it must be reported before the 8-hour
            window of an appointment time. Failure to do so will result in a{" "}
            <strong>1-week account suspension</strong>.
          </p>
          <p>
            If an appointment is scheduled and the Contractor fails to appear for the assigned job without
            prior notice, this will result in a <strong>1-month account suspension</strong>.
          </p>
          <p>
            During a suspension period, the contractor cannot access their dashboard or accept new job
            assignments. Please be considerate to your clients by reporting any need to reschedule or cancel
            within the appropriate window sanctioned by 8Fold.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-700">
        <h2 className="mb-2 text-base font-semibold text-slate-900">
          8Fold Contractor Terms &amp; Conditions ({TOS_VERSION})
        </h2>
        <p className="mb-2 text-slate-500 text-xs">Effective: March 2026</p>
        <p className="mb-4 text-slate-600">
          These Contractor Terms and Conditions (&ldquo;Agreement&rdquo;) govern participation in the 8Fold Contractor
          Network. By accepting these terms and using the 8Fold platform, you agree to provide services
          through the marketplace in accordance with the policies outlined below.
        </p>
        <p className="mb-6 text-slate-600">
          The purpose of these policies is to maintain fairness, transparency, and reliability for Job Posters,
          Contractors, and Routers, and to ensure the integrity of the 8Fold marketplace.
        </p>

        {/* 1.1 — Independent Contractor Status */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">1.1 &mdash; Independent Contractor Status</h3>
        <p className="mb-2">
          Contractors using the 8Fold platform operate as independent service providers and are not employees,
          agents, partners, or representatives of 8Fold.
        </p>
        <p className="mb-2">
          Participation in the platform does not create an employment relationship between 8Fold and the contractor.
        </p>
        <p className="mb-2">Contractors are solely responsible for:</p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Obtaining and maintaining any required licenses, certifications, or permits necessary to perform their services</li>
          <li>Maintaining appropriate insurance coverage where required by law or industry standards</li>
          <li>Complying with all applicable local, state/provincial, and federal regulations</li>
          <li>Reporting and paying all taxes associated with their earnings</li>
        </ul>
        <p className="mb-2">
          8Fold does not withhold taxes on behalf of contractors and does not provide employment benefits.
          Contractors are responsible for determining their own tax obligations and maintaining appropriate financial records.
        </p>
        <p className="mb-6 text-xs text-slate-500">
          8Fold acts only as a technology platform that connects job posters with independent contractors and
          facilitates payment processing through Stripe Connect.
        </p>

        {/* 1.2 — Insurance and Liability */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">1.2 &mdash; Insurance and Liability</h3>
        <p className="mb-2">
          Contractors are responsible for maintaining any insurance required to perform their services safely and legally.
          Depending on the nature of the services provided, this may include but is not limited to:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>General liability insurance</li>
          <li>Professional liability insurance</li>
          <li>Workers&apos; compensation insurance (where applicable)</li>
          <li>Vehicle insurance if transportation or delivery services are involved</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          8Fold does not provide insurance coverage for contractors and is not responsible for damages, losses,
          or liabilities arising from services performed by contractors. Contractors acknowledge that they assume
          full responsibility for the services they provide and agree to hold 8Fold harmless from claims arising
          from contractor work.
        </p>

        {/* 2. Contractor Responsibilities */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">2. Contractor Responsibilities</h3>
        <p className="mb-2">Contractors agree to perform services with professionalism, honesty, and reasonable care. Contractors must:</p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Provide services in good faith and in accordance with the job description</li>
          <li>Maintain accurate profile information including service regions and trade qualifications</li>
          <li>Communicate clearly with job posters regarding scheduling, arrival times, and job requirements</li>
          <li>Perform work to a professional standard consistent with industry expectations</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Contractors must not misrepresent their experience, credentials, or service capabilities.
        </p>

        {/* 3. Appointment Scheduling */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">3. Appointment Scheduling</h3>
        <p className="mb-2">
          Once a contractor accepts a job invitation, the contractor assumes responsibility for coordinating
          the appointment with the job poster. Contractors must:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Contact the job poster to confirm an appointment time</li>
          <li>Arrive at the agreed appointment time</li>
          <li>Notify the job poster promptly if delays occur</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Failure to properly manage appointments undermines marketplace reliability and may lead to disciplinary action.
        </p>

        {/* 4. Cancellation Policy */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">4. Cancellation Policy</h3>
        <p className="mb-2">Contractors may cancel an accepted job only when reasonable notice is provided.</p>
        <p className="mb-1 font-semibold">Acceptable Cancellation Window</p>
        <p className="mb-3">
          A contractor may cancel a job more than eight (8) hours before the scheduled appointment time without penalty.
        </p>
        <p className="mb-1 font-semibold">Late Cancellation</p>
        <p className="mb-2">
          Canceling within eight (8) hours of the scheduled appointment will result in a{" "}
          <strong>one (1) week suspension</strong> from the 8Fold platform.
        </p>
        <p className="mb-2">During a suspension period:</p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>The contractor cannot accept or receive new job invitations</li>
          <li>Existing scheduled jobs must still be honored unless reassigned by 8Fold Support</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Repeated late cancellations may result in longer suspensions or permanent removal from the platform.
        </p>

        {/* 5. No-Show Policy */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">5. No-Show Policy</h3>
        <p className="mb-2">A No-Show occurs when a contractor:</p>
        <ul className="mb-3 list-disc space-y-1 pl-5">
          <li>Accepts a job</li>
          <li>Fails to attend the appointment</li>
          <li>Fails to notify the job poster before the scheduled time</li>
        </ul>
        <p className="mb-2">
          A confirmed No-Show will result in a <strong>one (1) month suspension</strong> from the platform.
        </p>
        <p className="mb-6 text-xs text-slate-500">
          Repeated No-Show incidents may result in permanent account termination.
        </p>

        {/* 6. Professional Conduct */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">6. Professional Conduct</h3>
        <p className="mb-2">
          Contractors must maintain respectful and professional conduct when interacting with job posters,
          routers, and platform administrators. Prohibited conduct includes but is not limited to:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Harassment or abusive communication</li>
          <li>Discriminatory behavior of any kind</li>
          <li>Fraudulent claims of job completion</li>
          <li>Misrepresentation of qualifications or certifications</li>
          <li>Attempting to solicit or accept payment outside the 8Fold platform</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Violations of these standards may result in immediate suspension or account termination.
        </p>

        {/* 7. Payment Processing */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">7. Payment Processing</h3>
        <p className="mb-2">
          Payments for completed work are processed through Stripe Connect, the platform&apos;s payment processor.
          Contractors must:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Complete Stripe onboarding and verification</li>
          <li>Maintain a valid payout account</li>
          <li>Comply with identity verification requirements imposed by Stripe</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Contractors acknowledge that payout timing is subject to Stripe&apos;s processing policies and that
          8Fold does not control Stripe&apos;s verification or payout procedures.
        </p>

        {/* 8. Platform Integrity */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">8. Platform Integrity</h3>
        <p className="mb-2">
          To maintain a fair marketplace environment, contractors agree not to engage in activity that
          undermines the platform. Prohibited actions include:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Manipulating reviews or platform metrics</li>
          <li>Repeatedly accepting jobs with the intention of canceling them</li>
          <li>Operating multiple contractor accounts</li>
          <li>Attempting to bypass the platform for payment or contracting arrangements</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Violations may result in immediate account suspension or removal.
        </p>

        {/* 9. Suspensions and Enforcement */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">9. Suspensions and Enforcement</h3>
        <p className="mb-2">
          8Fold reserves the right to suspend or restrict contractor accounts when necessary to maintain
          platform integrity. Reasons for suspension may include:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5">
          <li>Late cancellations</li>
          <li>No-Show incidents</li>
          <li>Verified customer complaints</li>
          <li>Misrepresentation of skills or certifications</li>
          <li>Violations of these Terms and Conditions</li>
        </ul>
        <p className="mb-6 text-xs text-slate-500">
          Suspensions may be temporary or permanent depending on the severity and frequency of violations.
        </p>

        {/* 10. Account Termination */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">10. Account Termination</h3>
        <p className="mb-2">
          8Fold reserves the right to permanently terminate contractor accounts for serious or repeated
          violations of these Terms. Examples include:
        </p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Fraudulent activity</li>
          <li>Repeated No-Show incidents</li>
          <li>Abuse toward job posters, routers, or support staff</li>
          <li>Attempts to circumvent platform payment systems</li>
        </ul>

        {/* 11. Agreement and Acceptance */}
        <h3 className="mb-2 text-sm font-bold text-slate-900">11. Agreement and Acceptance</h3>
        <p>By selecting &ldquo;Accept Terms&rdquo;, you confirm that:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>You have read and understood these Terms and Conditions</li>
          <li>You agree to follow the policies outlined above</li>
          <li>You understand the cancellation, suspension, and enforcement rules described in this Agreement</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Acceptance of these terms is required in order to participate in the 8Fold Contractor Network.
        </p>
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
              I have read and accept the{" "}
              <span className="font-semibold">Contractor Terms &amp; Conditions</span> ({TOS_VERSION}).
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
