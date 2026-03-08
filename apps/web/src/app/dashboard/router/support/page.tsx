"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

export default function RouterSupportPage() {
  const { getToken } = useAuth();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("GENERAL_SUPPORT");
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
      const resp = await routerApiFetch("/api/web/v4/support/ticket", getToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), category, ticketType: category, body: body.trim() }),
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
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

  if (success) {
    return (
      <div className="space-y-5 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Ticket submitted. Check your{" "}
          <Link href="/dashboard/router/support/inbox" className="font-bold underline">
            Support Inbox
          </Link>{" "}
          for replies.
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/router/support/inbox"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            View Inbox
          </Link>
          <button
            type="button"
            onClick={() => setSuccess(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <Link
          href="/dashboard/router/support/inbox"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Inbox
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="GENERAL_SUPPORT">General Support</option>
              <option value="ROUTING_ISSUE">Routing Issue</option>
              <option value="JOB_ISSUE">Job Issue</option>
              <option value="ACCOUNT_SUPPORT">Account Support</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Message</span>
            <textarea
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[120px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue in detail"
              required
            />
          </label>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Ticket"}
          </button>
          <p className="text-xs text-slate-500">All communication stays internal — no emails shared.</p>
        </div>
      </form>
    </div>
  );
}
