"use client";

import React, { useState } from "react";

export default function RouterSupportPage() {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("HELP");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const resp = await fetch("/api/web/v4/support/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: subject.trim(), category, body: body.trim() }),
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok) throw new Error(json?.error?.message ?? json?.error ?? "Failed to create ticket");
      setSuccess(true);
      setSubject("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Support</h1>
      <form onSubmit={onSubmit} className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900 space-y-4 max-w-xl">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Subject</span>
          <input
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Category</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="HELP">Help</option>
            <option value="TECHNICAL">Technical</option>
            <option value="BILLING">Billing</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Message</span>
          <textarea
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        {error ? <div className="text-red-700">{error}</div> : null}
        {success ? <div className="text-green-700">Ticket created successfully.</div> : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-green-600 px-6 py-3 text-white disabled:opacity-50"
        >
          {saving ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>
    </div>
  );
}
