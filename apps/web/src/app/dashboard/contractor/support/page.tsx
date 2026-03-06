"use client";

import React, { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

export default function ContractorSupportPage() {
  const { getToken } = useAuth();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("GENERAL INQUIRY");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/support/ticket", getToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), category, body: body.trim() }),
      });
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const data = (await resp.json().catch(() => ({}))) as { id?: string; error?: string };
      if (resp.ok && data.id) {
        setSubmitted(true);
        setSubject("");
        setBody("");
      } else {
        setError(data?.error ?? "Failed to submit ticket.");
      }
    } catch (e: unknown) {
      if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
        setError("Authentication lost — please refresh and sign in again.");
      } else {
        setError("Failed to submit ticket.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Your support ticket has been submitted. We&apos;ll get back to you soon.
        </div>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Submit another ticket
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">Submit a support ticket.</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Brief description"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="GENERAL INQUIRY">General Inquiry</option>
            <option value="TECHNICAL INQUIRY">Technical Inquiry</option>
            <option value="REPORT A BUG">Report a Bug</option>
            <option value="REPORT A NO-SHOW">Report a No-Show</option>
            <option value="DISPUTE">Dispute</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Describe your issue..."
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Ticket"}
        </button>
        <p className="text-xs text-slate-500">
          &ldquo;Dispute&rdquo; routes directly to Admin Disputes. &ldquo;Report a No-Show&rdquo; routes to Support for office review.
        </p>
      </form>
    </div>
  );
}
