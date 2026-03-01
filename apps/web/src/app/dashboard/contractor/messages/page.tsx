"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Thread = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  lastMessageAt: string;
  jobDescription?: string | null;
  jobPosterFirstName?: string | null;
  jobPosterLastName?: string | null;
  tradeCategory?: string | null;
  availability?: string | null;
  contractorAmount?: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function mapEmbedUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "";
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}&z=14&output=embed`;
}

export default function ContractorMessagesPage() {
  const searchParams = useSearchParams();
  const requestedJobId = String(searchParams.get("jobId") ?? "").trim();

  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string>("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loadingThreads, setLoadingThreads] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedThread = React.useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const loadThreads = React.useCallback(async () => {
    setLoadingThreads(true);
    setError(null);
    try {
      const resp = await fetch("/api/v4/messages/threads?role=contractor", {
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
          const byJob = nextThreads.find((thread) => thread.jobId === requestedJobId);
          if (byJob) return byJob.id;
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

  const mapUrl = mapEmbedUrl(selectedThread?.latitude, selectedThread?.longitude);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
      <p className="mt-1 text-slate-600">Communicate with your client from routed jobs.</p>

      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
            <button
              type="button"
              onClick={() => void loadThreads()}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loadingThreads ? (
              <p className="p-4 text-sm text-slate-600">Loading threads…</p>
            ) : threads.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No message threads yet.</p>
            ) : (
              <ul>
                {threads.map((thread) => {
                  const active = thread.id === selectedThreadId;
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${active ? "bg-emerald-50" : "bg-white"}`}
                      >
                        <div className="font-medium text-slate-900">{thread.jobTitle || `Job ${thread.jobId.slice(0, 8)}`}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Updated {new Date(thread.lastMessageAt).toLocaleString()}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {selectedThread?.jobTitle || "Select a conversation"}
            </h2>
          </div>

          <div className="max-h-[48vh] overflow-y-auto px-4 py-4">
            {!selectedThreadId ? (
              <p className="text-sm text-slate-500">No conversation selected.</p>
            ) : loadingMessages ? (
              <p className="text-sm text-slate-600">Loading messages…</p>
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

          {selectedThread ? (
            <details className="border-t border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Job Summary</summary>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p><span className="font-medium">Job Title:</span> {selectedThread.jobTitle || "Job"}</p>
                <p><span className="font-medium">Description:</span> {selectedThread.jobDescription || "Not provided"}</p>
                <p>
                  <span className="font-medium">Poster Name:</span>{" "}
                  {[selectedThread.jobPosterFirstName, selectedThread.jobPosterLastName].filter(Boolean).join(" ") || "Unknown"}
                </p>
                <p><span className="font-medium">Trade Category:</span> {selectedThread.tradeCategory || "General"}</p>
                <p><span className="font-medium">Availability:</span> {selectedThread.availability || "Not provided"}</p>
                <p className="font-semibold text-emerald-700">
                  Contractor Amount: {formatMoney(selectedThread.contractorAmount)}
                </p>
                <p><span className="font-medium">Address:</span> {selectedThread.address || "Not provided"}</p>
              </div>

              {mapUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <iframe
                    title="Job location"
                    src={mapUrl}
                    loading="lazy"
                    className="h-56 w-full border-0"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : null}

              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                For your protection, client phone numbers and emails are not displayed. Please request contact information through the messenger if needed.
              </p>
            </details>
          ) : null}
        </section>
      </div>

      <div className="mt-4">
        <Link href="/dashboard/contractor" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Back to Contractor Dashboard
        </Link>
      </div>
    </div>
  );
}
