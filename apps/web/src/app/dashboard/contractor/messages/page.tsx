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
  jobPosterFirstName?: string | null;
  jobPosterLastName?: string | null;
  tradeCategory?: string | null;
  availability?: string | null;
  contractorAmount?: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function mapEmbedUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "";
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}&z=14&output=embed`;
}

function toIsoFromLocal(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toStatusBadge(thread: Thread): "ASSIGNED" | "APPOINTMENT_BOOKED" | "APPOINTMENT_ACCEPTED" | null {
  const status = String(thread.jobStatus ?? "").toUpperCase();
  if (status === "ASSIGNED") return "ASSIGNED";
  if (thread.appointmentAt && thread.appointmentAcceptedAt) return "APPOINTMENT_ACCEPTED";
  if (thread.appointmentAt) return "APPOINTMENT_BOOKED";
  return null;
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
  const [booking, setBooking] = React.useState(false);
  const [rescheduling, setRescheduling] = React.useState(false);
  const [canceling, setCanceling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [bookAtLocal, setBookAtLocal] = React.useState("");
  const [rescheduleAtLocal, setRescheduleAtLocal] = React.useState("");

  const selectedThread = React.useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const loadThreads = React.useCallback(async () => {
    setLoadingThreads(true);
    setError(null);
    try {
      const resp = await fetch("/api/web/v4/contractor/messages/threads", {
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
      const resp = await fetch(`/api/web/v4/contractor/messages/thread/${encodeURIComponent(threadId)}`, {
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
      const resp = await fetch(`/api/web/v4/contractor/messages/thread/${encodeURIComponent(selectedThreadId)}/send`, {
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

  async function handleBookAppointment() {
    if (!selectedThread || booking) return;
    const appointmentAt = toIsoFromLocal(bookAtLocal);
    if (!appointmentAt) {
      setError("Please provide a valid appointment date and time.");
      return;
    }

    setBooking(true);
    setError(null);
    try {
      const resp = await fetch(`/api/web/v4/contractor/jobs/${encodeURIComponent(selectedThread.jobId)}/book-appointment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appointmentAt }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to book appointment";
        setError(message);
        return;
      }
      setToast("Appointment booked.");
      await loadThreads();
      if (selectedThreadId) await loadMessages(selectedThreadId);
    } catch {
      setError("Failed to book appointment");
    } finally {
      setBooking(false);
    }
  }

  async function handleReschedule() {
    if (!selectedThread || rescheduling) return;
    const appointmentAt = toIsoFromLocal(rescheduleAtLocal);
    if (!appointmentAt) {
      setError("Please provide a valid reschedule date and time.");
      return;
    }

    setRescheduling(true);
    setError(null);
    try {
      const resp = await fetch(`/api/web/v4/contractor/jobs/${encodeURIComponent(selectedThread.jobId)}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appointmentAt }),
      });
      const data = (await resp.json().catch(() => ({}))) as { action?: string; error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to reschedule";
        setError(message);
        return;
      }
      setToast(data.action === "UNASSIGNED_AND_REOPENED" ? "Job unassigned and reopened for routing." : "Appointment rescheduled.");
      await loadThreads();
      if (selectedThreadId) await loadMessages(selectedThreadId);
    } catch {
      setError("Failed to reschedule");
    } finally {
      setRescheduling(false);
    }
  }

  async function handleCancel() {
    if (!selectedThread || canceling) return;
    setCanceling(true);
    setError(null);
    try {
      const resp = await fetch(`/api/web/v4/contractor/jobs/${encodeURIComponent(selectedThread.jobId)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to cancel job";
        setError(message);
        return;
      }
      setToast("Job unassigned and reopened for routing.");
      await loadThreads();
      if (selectedThreadId) await loadMessages(selectedThreadId);
    } catch {
      setError("Failed to cancel job");
    } finally {
      setCanceling(false);
    }
  }

  const selectedLabel = selectedThread
    ? `${selectedThread.jobTitle || `Job ${selectedThread.jobId.slice(0, 8)}`} — ${toStatusBadge(selectedThread) || "ACTIVE"}`
    : "Select conversation";
  const mapUrl = mapEmbedUrl(selectedThread?.latitude, selectedThread?.longitude);
  const appointmentBooked = Boolean(selectedThread?.appointmentAt);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
      <p className="mt-1 text-slate-600">Coordinate scheduling and lifecycle actions from one workspace.</p>

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
              {(thread.jobTitle || `Job ${thread.jobId.slice(0, 8)}`) + " — " + (toStatusBadge(thread) || "ACTIVE")}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Chat Thread</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedLabel}</p>
        </div>

        <div className="max-h-[48vh] overflow-y-auto px-4 py-4">
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
        <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
          {!selectedThread ? (
            <p className="text-slate-500">Select a conversation to manage appointment actions.</p>
          ) : String(selectedThread.jobStatus ?? "").toUpperCase() === "ASSIGNED" && !appointmentBooked ? (
            <>
              <p>Assignment is active with no appointment yet.</p>
              <label className="block text-xs font-medium text-slate-600">Appointment Date/Time</label>
              <input
                type="datetime-local"
                value={bookAtLocal}
                onChange={(event) => setBookAtLocal(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleBookAppointment()}
                disabled={booking}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {booking ? "Working..." : "BOOK APPOINTMENT"}
              </button>
            </>
          ) : appointmentBooked ? (
            <>
              <p>
                <span className="font-medium">Appointment:</span> {selectedThread.appointmentAt ? new Date(selectedThread.appointmentAt).toLocaleString() : "Not available"}
              </p>
              <label className="block text-xs font-medium text-slate-600">New Date/Time</label>
              <input
                type="datetime-local"
                value={rescheduleAtLocal}
                onChange={(event) => setRescheduleAtLocal(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleReschedule()}
                  disabled={rescheduling}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {rescheduling ? "Working..." : "Reschedule Job"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={canceling}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {canceling ? "Working..." : "Cancel Job"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-slate-500">No lifecycle actions are currently available for this thread.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <details className="px-4 py-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Job Summary</summary>
          {selectedThread ? (
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p><span className="font-medium">Job Title:</span> {selectedThread.jobTitle || "Job"}</p>
              <p><span className="font-medium">Description:</span> {selectedThread.jobDescription || "Not provided"}</p>
              <p>
                <span className="font-medium">Poster Name:</span>{" "}
                {[selectedThread.jobPosterFirstName, selectedThread.jobPosterLastName].filter(Boolean).join(" ") || "Unknown"}
              </p>
              <p><span className="font-medium">Trade Category:</span> {selectedThread.tradeCategory || "General"}</p>
              <p><span className="font-medium">Availability:</span> {selectedThread.availability || "Not provided"}</p>
              <p className="font-semibold text-emerald-700">Contractor Amount: {formatMoney(selectedThread.contractorAmount)}</p>
              <p><span className="font-medium">Address:</span> {selectedThread.address || "Not provided"}</p>

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
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Select a conversation to view job details.</p>
          )}
        </details>
      </section>
    </div>
  );
}
