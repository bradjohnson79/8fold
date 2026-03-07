"use client";

import React, { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

export default function JobPosterSupportPage() {
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), category, body: body.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (resp.ok && data.id) {
        setSubmitted(true);
        setSubject("");
        setBody("");
      } else {
        setError(data?.error?.message ?? "Failed to submit ticket.");
      }
    } catch {
      setError("Failed to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-5 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-emerald-800">Your support ticket has been submitted. We&apos;ll get back to you soon.</p>
        </div>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Submit another ticket
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">Submit a support ticket.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Subject</div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Brief description"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Category</div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="GENERAL INQUIRY">General Inquiry</option>
              <option value="TECHNICAL INQUIRY">Technical Inquiry</option>
              <option value="REPORT A BUG">Report a Bug</option>
              <option value="REPORT A NO-SHOW">Report a No-Show</option>
              <option value="DISPUTE">Dispute</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Message</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Describe your issue..."
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Ticket"}
          </button>

          <p className="text-xs text-slate-500">
            DISPUTE routes directly to Admin Disputes. REPORT A NO-SHOW routes to Support for office review.
          </p>
        </div>
      </form>
    </div>
  );
}
