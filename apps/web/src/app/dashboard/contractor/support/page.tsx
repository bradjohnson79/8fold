"use client";

import React, { useState } from "react";

export default function ContractorSupportPage() {
  const [subject, setSubject] = useState("");
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
      const resp = await fetch("/api/web/v4/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { id?: string; error?: string };
      if (resp.ok && data.id) {
        setSubmitted(true);
        setSubject("");
        setBody("");
      } else {
        setError(data?.error ?? "Failed to submit ticket.");
      }
    } catch {
      setError("Failed to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-2xl font-bold">Support</h1>
        <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          Your support ticket has been submitted. We&apos;ll get back to you soon.
        </div>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Submit another ticket
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold">Support</h1>
      <p className="mt-1 text-gray-600">Submit a support ticket.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="Brief description"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="Describe your issue..."
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting…" : "Submit Ticket"}
        </button>
      </form>
    </div>
  );
}
