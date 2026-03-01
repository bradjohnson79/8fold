"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

type Thread = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  lastMessageAt: string;
  jobStatus?: string | null;
  jobDescription?: string | null;
  tradeCategory?: string | null;
  availability?: string | null;
  contractorName?: string | null;
  contractorBusinessName?: string | null;
  contractorYearsExperience?: number | null;
  contractorCity?: string | null;
  contractorRegion?: string | null;
  appointmentAt?: string | null;
  appointmentAcceptedAt?: string | null;
};

type Message = {
  id: string;
  jobId: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function toStatusBadge(thread: Thread): "ASSIGNED" | "APPOINTMENT_BOOKED" | "APPOINTMENT_ACCEPTED" | null {
  const status = String(thread.jobStatus ?? "").toUpperCase();
  if (status === "ASSIGNED") return "ASSIGNED";
  if (thread.appointmentAt && thread.appointmentAcceptedAt) return "APPOINTMENT_ACCEPTED";
  if (thread.appointmentAt) return "APPOINTMENT_BOOKED";
  return null;
}

export default function JobPosterMessagesPage() {
  const searchParams = useSearchParams();
  const requestedJobId = String(searchParams.get("jobId") ?? "").trim();

  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string>("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loadingThreads, setLoadingThreads] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const selectedThread = React.useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const loadThreads = React.useCallback(async () => {
    setLoadingThreads(true);
    setError(null);
    try {
      const resp = await fetch("/api/v4/messages/threads?role=job_poster", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { threads?: Thread[]; error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load threads";
        setError(message);
        return;
      }

      const nextThreads = Array.isArray(data.threads) ? data.threads : [];
      setThreads(nextThreads);
      setSelectedThreadId((current) => {
        if (requestedJobId) {
          const matched = nextThreads.find((thread) => thread.jobId === requestedJobId);
          if (matched) return matched.id;
        }
        if (current && nextThreads.some((thread) => thread.id === current)) return current;
        return nextThreads[0]?.id ?? "";
      });
    } catch {
      setError("Failed to load threads");
    } finally {
      setLoadingThreads(false);
    }
  }, [requestedJobId]);

  const loadMessages = React.useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const resp = await fetch(`/api/v4/messages/thread/${encodeURIComponent(threadId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { messages?: Message[]; error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load messages";
        setError(message);
        return;
      }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  React.useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  React.useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [selectedThreadId, loadMessages]);

  async function handleSend() {
    const body = draft.trim();
    if (!selectedThreadId || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      const resp = await fetch(`/api/v4/messages/thread/${encodeURIComponent(selectedThreadId)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to send message";
        setError(message);
        return;
      }
      setDraft("");
      await loadMessages(selectedThreadId);
      await loadThreads();
    } catch {
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptAppointment() {
    if (!selectedThread || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/web/v4/job-poster/jobs/${encodeURIComponent(selectedThread.jobId)}/accept-appointment`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message =
          typeof payload.error === "string" ? payload.error : payload.error?.message ?? "Failed to accept appointment";
        setError(message);
        return;
      }
      setToast("Appointment accepted.");
      await loadThreads();
      if (selectedThreadId) await loadMessages(selectedThreadId);
    } catch {
      setError("Failed to accept appointment");
    } finally {
      setAccepting(false);
    }
  }

  const selectedLabel = selectedThread
    ? `${selectedThread.jobTitle || `Job ${selectedThread.jobId.slice(0, 8)}`} — ${selectedThread.contractorName || "Assigned Contractor"}`
    : "Select conversation";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
      <p className="mt-1 text-slate-600">Coordinate appointment and job lifecycle with your contractor.</p>

      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {toast ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{toast}</p> : null}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="thread-select" className="text-sm font-medium text-slate-700">
          Conversation Dropdown
        </label>
        <select
          id="thread-select"
          value={selectedThreadId}
          onChange={(event) => setSelectedThreadId(event.target.value)}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
          disabled={loadingThreads || threads.length === 0}
        >
          {threads.length === 0 ? <option value="">{loadingThreads ? "Loading..." : "No conversations"}</option> : null}
          {threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {(thread.jobTitle || `Job ${thread.jobId.slice(0, 8)}`) + " — " + (thread.contractorName || "Assigned Contractor")}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Chat Thread</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedLabel}</p>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-4 py-4">
          {!selectedThreadId ? (
            <p className="text-sm text-slate-500">No conversation selected.</p>
          ) : loadingMessages ? (
            <p className="text-sm text-slate-600">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div key={message.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <div className="whitespace-pre-wrap text-sm text-slate-800">{message.body}</div>
                  <div className="mt-1 text-xs text-slate-500">{new Date(message.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!selectedThreadId || sending}
              placeholder={selectedThreadId ? "Type a message..." : "Select a conversation first"}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!selectedThreadId || !draft.trim() || sending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Action Panel</h2>
        </div>
        <div className="space-y-2 px-4 py-4 text-sm text-slate-700">
          {!selectedThread ? (
            <p className="text-slate-500">Select a conversation to view appointment actions.</p>
          ) : (
            <>
              {selectedThread.appointmentAt ? (
                <p>
                  <span className="font-medium">Appointment:</span> {new Date(selectedThread.appointmentAt).toLocaleString()}
                </p>
              ) : (
                <p>No appointment has been booked yet.</p>
              )}
              {toStatusBadge(selectedThread) ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                  {toStatusBadge(selectedThread)}
                </span>
              ) : null}
              {selectedThread.appointmentAt && !selectedThread.appointmentAcceptedAt ? (
                <button
                  type="button"
                  onClick={() => void handleAcceptAppointment()}
                  disabled={accepting}
                  className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {accepting ? "Working..." : "Accept Appointment"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <details className="px-4 py-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Contractor Summary</summary>
          {selectedThread ? (
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p><span className="font-medium">Job Title:</span> {selectedThread.jobTitle || "Job"}</p>
              <p><span className="font-medium">Contractor:</span> {selectedThread.contractorName || "Assigned Contractor"}</p>
              <p><span className="font-medium">Business:</span> {selectedThread.contractorBusinessName || "Not provided"}</p>
              <p><span className="font-medium">Trade:</span> {selectedThread.tradeCategory || "Not provided"}</p>
              <p><span className="font-medium">Experience:</span> {selectedThread.contractorYearsExperience ?? 0} years</p>
              <p>
                <span className="font-medium">Location:</span>{" "}
                {[selectedThread.contractorCity, selectedThread.contractorRegion].filter(Boolean).join(", ") || "Not provided"}
              </p>
              <p><span className="font-medium">Availability:</span> {selectedThread.availability || "Not provided"}</p>
              <p><span className="font-medium">Description:</span> {selectedThread.jobDescription || "Not provided"}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Select a conversation to view contractor details.</p>
          )}
        </details>
      </section>
    </div>
  );
}
