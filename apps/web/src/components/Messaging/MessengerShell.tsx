"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type MessengerRole = "contractor" | "job-poster";

type ThreadRow = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  status: string;
  lastMessageAt: string;
  jobDescription?: string | null;
  tradeCategory?: string | null;
  appointmentAt?: string | null;
  contractorName?: string | null;
  contractorBusinessName?: string | null;
  contractorYearsExperience?: number | null;
  contractorCity?: string | null;
  contractorRegion?: string | null;
  jobPosterFirstName?: string | null;
  jobPosterLastName?: string | null;
  address?: string | null;
  contractorAmount?: number | null;
};

type MessageRow = {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
};

type Appointment = {
  id: string;
  threadId: string;
  status: string;
  scheduledAtUTC: string;
  timeRemaining: {
    milliseconds: number;
    totalMinutes: number;
    hours: number;
    minutes: number;
    lateAction: boolean;
  };
} | null;

type SummaryPayload = {
  role: "CONTRACTOR" | "JOB_POSTER";
  contractor?: {
    name: string;
    businessName: string | null;
    trades: string[];
    yearsExperience: number | null;
    serviceRegion: string | null;
    serviceRadiusKm: number | null;
  };
  jobPoster?: {
    name: string;
    location: string | null;
  };
  job?: {
    title: string;
    category: string | null;
    description: string | null;
    feeSummary: {
      amountCents: number;
      totalAmountCents: number;
      contractorPayoutCents: number;
    };
  };
  appointment: {
    scheduledAtUTC: string;
    status: string;
    timeRemaining: {
      milliseconds: number;
      totalMinutes: number;
      hours: number;
      minutes: number;
      lateAction: boolean;
    };
  } | null;
  reminders: string[];
};

type CompleteForm = {
  completedOn: string;
  completedTime: string;
  summaryText: string;
  punctuality: string;
  communication: string;
  quality: string;
  cooperation: string;
};

function rolePath(role: MessengerRole) {
  return role === "contractor" ? "contractor" : "job-poster";
}

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function isConversationEnded(status: string | null | undefined) {
  return String(status ?? "").toUpperCase() === "ENDED";
}

function fmtTimeRemaining(appointment: Appointment, nowMs = Date.now()) {
  if (!appointment) return "---";
  const target = new Date(appointment.scheduledAtUTC).getTime();
  const delta = target - nowMs;
  if (!Number.isFinite(delta)) return "---";
  if (delta <= 0) return "Started";
  const totalMinutes = Math.floor(delta / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function toLocalInputValue(isoUtc: string | null | undefined) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MessengerShell({ role }: { role: MessengerRole }) {
  const roleApi = rolePath(role);
  const isContractor = role === "contractor";
  const searchParams = useSearchParams();
  const preselectJobId = searchParams.get("jobId") ?? searchParams.get("job") ?? "";
  const preselectThreadId = searchParams.get("threadId") ?? "";

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [appointment, setAppointment] = useState<Appointment>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [error, setError] = useState<string>("");

  const [openBook, setOpenBook] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [openReschedule, setOpenReschedule] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [openComplete, setOpenComplete] = useState(false);

  const [bookAt, setBookAt] = useState("");
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [completeForm, setCompleteForm] = useState<CompleteForm>({
    completedOn: "",
    completedTime: "",
    summaryText: "",
    punctuality: "",
    communication: "",
    quality: "",
    cooperation: "",
  });

  const endRef = useRef<HTMLDivElement | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadThreads() {
    setLoadingThreads(true);
    setError("");
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/threads`, { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => ({}))) as { threads?: ThreadRow[]; error?: string };
      if (!resp.ok) throw new Error(json?.error || "Failed to load threads");
      const rows = Array.isArray(json?.threads) ? json.threads : [];
      setThreads(rows);
      setSelectedId((current) => {
        if (current && rows.some((t) => t.id === current)) return current;
        if (preselectThreadId) {
          const byThread = rows.find((t) => String(t.id) === String(preselectThreadId));
          if (byThread) return byThread.id;
        }
        if (preselectJobId) {
          const byJob = rows.find((t) => String(t.jobId) === String(preselectJobId));
          if (byJob) return byJob.id;
        }
        return rows[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load threads");
      setThreads([]);
      setSelectedId(null);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    setError("");
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(threadId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await resp.json().catch(() => ({}))) as { messages?: MessageRow[]; error?: string };
      if (!resp.ok) throw new Error(json?.error || "Failed to load messages");
      setMessages(Array.isArray(json?.messages) ? json.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadMeta(threadId: string) {
    setLoadingMeta(true);
    try {
      const [apptResp, summaryResp] = await Promise.all([
        fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(threadId)}/appointment`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(threadId)}/summary`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const apptJson = (await apptResp.json().catch(() => ({}))) as { appointment?: Appointment; error?: string };
      if (apptResp.ok) {
        setAppointment((apptJson.appointment as Appointment) ?? null);
      } else {
        setAppointment(null);
      }

      const summaryJson = (await summaryResp.json().catch(() => ({}))) as { summary?: SummaryPayload; error?: string };
      if (summaryResp.ok && summaryJson.summary) {
        setSummary(summaryJson.summary);
      } else {
        setSummary(null);
      }
    } finally {
      setLoadingMeta(false);
    }
  }

  useEffect(() => {
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleApi, preselectJobId, preselectThreadId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setAppointment(null);
      setSummary(null);
      return;
    }
    void Promise.all([loadMessages(selectedId), loadMeta(selectedId)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedId]);

  const selectedThread = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);
  const ended = isConversationEnded(selectedThread?.status);

  const viewApptEnabled = isContractor ? true : Boolean(appointment);
  const canRescheduleOrCancel = Boolean(appointment) && !ended;
  const appointmentReached = Boolean(appointment && new Date(appointment.scheduledAtUTC).getTime() <= nowMs);
  const canComplete = Boolean(appointmentReached && !ended);

  async function sendMessage() {
    const body = draft.trim();
    if (!selectedId || !body || sending || ended) return;
    setSending(true);
    setError("");
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(selectedId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !json?.ok) throw new Error(json?.error || "Failed to send");
      setDraft("");
      await Promise.all([loadMessages(selectedId), loadThreads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function submitBook() {
    if (!selectedId || !bookAt) return;
    if (!window.confirm("Confirm appointment booking?")) return;
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(selectedId)}/appointment/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scheduledAtUTC: new Date(bookAt).toISOString() }),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to book appointment");
      setOpenBook(false);
      await Promise.all([loadMessages(selectedId), loadMeta(selectedId), loadThreads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book appointment");
    }
  }

  async function submitReschedule() {
    if (!selectedId || !rescheduleAt) return;
    if (!window.confirm("Confirm appointment reschedule?")) return;
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(selectedId)}/appointment/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scheduledAtUTC: new Date(rescheduleAt).toISOString() }),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to reschedule appointment");
      setOpenReschedule(false);
      await Promise.all([loadMessages(selectedId), loadMeta(selectedId), loadThreads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reschedule appointment");
    }
  }

  async function submitCancel() {
    if (!selectedId) return;
    if (!window.confirm("Confirm appointment cancellation?")) return;
    try {
      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(selectedId)}/appointment/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to cancel appointment");
      setOpenCancel(false);
      await Promise.all([loadMessages(selectedId), loadMeta(selectedId), loadThreads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel appointment");
    }
  }

  async function submitComplete() {
    if (!selectedId || completeSubmitting) return;
    setCompleteSubmitting(true);
    try {
      const payload: Record<string, string> = {
        completedOn: completeForm.completedOn,
        completedTime: completeForm.completedTime,
        summaryText: completeForm.summaryText,
      };
      if (isContractor) {
        payload.cooperation = completeForm.cooperation;
        payload.communication = completeForm.communication;
      } else {
        payload.punctuality = completeForm.punctuality;
        payload.communication = completeForm.communication;
        payload.quality = completeForm.quality;
      }

      const resp = await fetch(`/api/web/v4/${roleApi}/messages/thread/${encodeURIComponent(selectedId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to submit completion report");

      setOpenComplete(false);
      setCompleteForm({
        completedOn: "",
        completedTime: "",
        summaryText: "",
        punctuality: "",
        communication: "",
        quality: "",
        cooperation: "",
      });
      await Promise.all([loadMessages(selectedId), loadMeta(selectedId), loadThreads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete job");
    } finally {
      setCompleteSubmitting(false);
    }
  }

  const apptRemainingLabel = fmtTimeRemaining(appointment, nowMs);
  const showLateWarning = Boolean(appointment?.timeRemaining?.lateAction);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Messenger</h1>
      <p className="mt-1 text-slate-600">All active job communication and lifecycle actions live here.</p>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (isContractor ? setOpenBook(true) : setOpenView(true))}
              disabled={!selectedId || ended || (!isContractor && !viewApptEnabled)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              {isContractor ? "BOOK APPT" : "VIEW APPT"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRescheduleAt(toLocalInputValue(appointment?.scheduledAtUTC ?? null));
                setOpenReschedule(true);
              }}
              disabled={!selectedId || !canRescheduleOrCancel}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              RESCHEDULE
            </button>
            <button
              type="button"
              onClick={() => setOpenCancel(true)}
              disabled={!selectedId || !canRescheduleOrCancel}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => setOpenComplete(true)}
              disabled={!selectedId || !canComplete}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              COMPLETE JOB
            </button>
          </div>
        </div>

        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-3">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Messages Section</h2>
              <button
                type="button"
                onClick={() => void loadThreads()}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
              >
                Refresh
              </button>
            </div>

            {loadingThreads ? (
              <p className="mt-3 text-sm text-slate-500">Loading threads...</p>
            ) : threads.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No active messenger threads yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {threads.map((thread) => {
                  const active = thread.id === selectedId;
                  const endedThread = isConversationEnded(thread.status);
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedId(thread.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${
                        active ? "border-emerald-300 bg-white" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{thread.jobTitle ?? `Job ${thread.jobId}`}</p>
                        {endedThread ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Ended</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "No messages yet"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <main className="lg:col-span-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Chat Window</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedThread?.jobTitle ?? "Select a thread to start messaging."}
                </p>
              </div>
              {selectedId ? (
                <button
                  type="button"
                  onClick={() => selectedId && void Promise.all([loadMessages(selectedId), loadMeta(selectedId), loadThreads()])}
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Refresh
                </button>
              ) : null}
            </div>

            {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            {ended ? <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">Conversation Ended. This thread is read-only.</p> : null}

            <div className="mt-3 min-h-[300px] rounded-xl border border-slate-200 p-3">
              {!selectedId ? (
                <p className="text-sm text-slate-500">No conversation selected.</p>
              ) : loadingMessages ? (
                <p className="text-sm text-slate-500">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                  {messages.map((m) => {
                    const sender = String(m.senderRole ?? "").toUpperCase();
                    const mine = (isContractor && sender === "CONTRACTOR") || (!isContractor && sender === "POSTER");
                    const system = sender === "SYSTEM";
                    if (system) {
                      return (
                        <div key={m.id} className="text-center">
                          <span className="inline-block rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">{m.body}</span>
                          <p className="mt-1 text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString()}</p>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-900"}`}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`mt-1 text-[10px] ${mine ? "text-emerald-100" : "text-slate-600"}`}>{new Date(m.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!selectedId || sending || ended}
                rows={2}
                placeholder={ended ? "Conversation Ended." : "Type a message..."}
                className="min-h-[64px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!selectedId || sending || ended || draft.trim().length === 0}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-700">
              Job Appointment Begins In {appointment ? apptRemainingLabel : "---"}
              {appointment ? (
                <button
                  type="button"
                  onClick={() => selectedId && void loadMeta(selectedId)}
                  className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                >
                  Refresh
                </button>
              ) : null}
            </p>
          </main>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <details className="px-4 py-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Summary Accordion</summary>
          <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
            {!selectedId ? (
              <p className="text-slate-500">Select a conversation to view summary.</p>
            ) : loadingMeta ? (
              <p className="text-slate-500">Loading summary...</p>
            ) : !summary ? (
              <p className="text-slate-500">Summary unavailable.</p>
            ) : summary.role === "JOB_POSTER" ? (
              <div className="space-y-1">
                <p><span className="font-semibold">Contractor:</span> {summary.contractor?.name ?? "Assigned Contractor"}</p>
                {summary.contractor?.businessName ? <p><span className="font-semibold">Business:</span> {summary.contractor.businessName}</p> : null}
                <p><span className="font-semibold">Trade(s):</span> {(summary.contractor?.trades ?? []).join(", ") || "—"}</p>
                <p><span className="font-semibold">Years of Experience:</span> {summary.contractor?.yearsExperience ?? "—"}</p>
                <p><span className="font-semibold">Service Region:</span> {summary.contractor?.serviceRegion ?? "—"}</p>
                <p><span className="font-semibold">Service Radius:</span> {summary.contractor?.serviceRadiusKm ?? "—"} km</p>
                <p><span className="font-semibold">Appointment:</span> {summary.appointment ? new Date(summary.appointment.scheduledAtUTC).toLocaleString() : "Not booked"}</p>
                <p className="pt-2 text-xs text-slate-500">Key reminder: reschedule or cancel outside the 8-hour window to avoid penalties.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p><span className="font-semibold">Job Poster:</span> {summary.jobPoster?.name ?? "Job Poster"}</p>
                <p><span className="font-semibold">Location:</span> {summary.jobPoster?.location ?? "—"}</p>
                <p><span className="font-semibold">Job Title:</span> {summary.job?.title ?? "—"}</p>
                <p><span className="font-semibold">Category:</span> {summary.job?.category ?? "—"}</p>
                <p><span className="font-semibold">Scope:</span> {summary.job?.description ?? "—"}</p>
                <p><span className="font-semibold">Job Fee:</span> {formatMoney(summary.job?.feeSummary?.contractorPayoutCents ?? summary.job?.feeSummary?.amountCents ?? 0)}</p>
                <p><span className="font-semibold">Appointment:</span> {summary.appointment ? new Date(summary.appointment.scheduledAtUTC).toLocaleString() : "Not booked"}</p>
                <p className="pt-2 text-xs text-slate-500">Key reminder: reschedule or cancel outside the 8-hour window to avoid penalties.</p>
              </div>
            )}
          </div>
        </details>
      </section>

      {openBook ? (
        <Modal title="Book Appointment" onClose={() => setOpenBook(false)}>
          <label className="text-sm font-medium text-slate-700">Date & Time</label>
          <input
            type="datetime-local"
            value={bookAt}
            onChange={(e) => setBookAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={() => void submitBook()}
            disabled={!bookAt}
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Confirm Booking
          </button>
        </Modal>
      ) : null}

      {openView ? (
        <Modal title="View Appointment" onClose={() => setOpenView(false)}>
          {appointment ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold">Scheduled:</span> {new Date(appointment.scheduledAtUTC).toLocaleString()}</p>
              <p><span className="font-semibold">Status:</span> {appointment.status}</p>
              <p><span className="font-semibold">Time Remaining:</span> {fmtTimeRemaining(appointment, nowMs)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No appointment has been booked yet.</p>
          )}
        </Modal>
      ) : null}

      {openReschedule ? (
        <Modal
          title={`Reschedule Appointment • Time Remaining Before Appointment: ${appointment ? fmtTimeRemaining(appointment, nowMs) : "---"}`}
          onClose={() => setOpenReschedule(false)}
        >
          {showLateWarning ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Late Action - Penalties Will Apply. Poster refund: 50% contractor fee. Contractor suspension: 1 week and hidden from router listing.
            </p>
          ) : null}
          <label className="text-sm font-medium text-slate-700">New Date & Time</label>
          <input
            type="datetime-local"
            value={rescheduleAt}
            onChange={(e) => setRescheduleAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={() => void submitReschedule()}
            disabled={!rescheduleAt}
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Confirm Reschedule
          </button>
        </Modal>
      ) : null}

      {openCancel ? (
        <Modal
          title={`Cancel Appointment • Time Remaining Before Appointment: ${appointment ? fmtTimeRemaining(appointment, nowMs) : "---"}`}
          onClose={() => setOpenCancel(false)}
        >
          {showLateWarning ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Late Action - Penalties Will Apply. Poster refund: 50% contractor fee. Contractor suspension: 1 week and hidden from router listing.
            </p>
          ) : null}
          <p className="text-sm text-slate-700">This cancels the appointment only and keeps the assignment active.</p>
          <button
            type="button"
            onClick={() => void submitCancel()}
            className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Confirm Cancel Appointment
          </button>
        </Modal>
      ) : null}

      {openComplete ? (
        <Modal title="Complete Job Report" onClose={() => setOpenComplete(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Job Completed on</label>
                <input
                  type="date"
                  value={completeForm.completedOn}
                  onChange={(e) => setCompleteForm((s) => ({ ...s, completedOn: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Approx Time Completed</label>
                <input
                  type="time"
                  value={completeForm.completedTime}
                  onChange={(e) => setCompleteForm((s) => ({ ...s, completedTime: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Job Summary</label>
              <textarea
                rows={4}
                value={completeForm.summaryText}
                onChange={(e) => setCompleteForm((s) => ({ ...s, summaryText: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>

            {isContractor ? (
              <div className="grid grid-cols-2 gap-2">
                <RatingField
                  label="Cooperation (0-10)"
                  value={completeForm.cooperation}
                  onChange={(v) => setCompleteForm((s) => ({ ...s, cooperation: v }))}
                />
                <RatingField
                  label="Communication (0-10)"
                  value={completeForm.communication}
                  onChange={(v) => setCompleteForm((s) => ({ ...s, communication: v }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <RatingField
                  label="Punctuality (0-10)"
                  value={completeForm.punctuality}
                  onChange={(v) => setCompleteForm((s) => ({ ...s, punctuality: v }))}
                />
                <RatingField
                  label="Communication (0-10)"
                  value={completeForm.communication}
                  onChange={(v) => setCompleteForm((s) => ({ ...s, communication: v }))}
                />
                <RatingField
                  label="Quality (0-10)"
                  value={completeForm.quality}
                  onChange={(v) => setCompleteForm((s) => ({ ...s, quality: v }))}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void submitComplete()}
              disabled={completeSubmitting || !completeForm.completedOn || !completeForm.completedTime || !completeForm.summaryText.trim()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {completeSubmitting ? "Submitting..." : "Submit Completion Report"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
          <button type="button" onClick={props.onClose} className="rounded border border-slate-300 px-2 py-1 text-xs">
            Close
          </button>
        </div>
        <div className="mt-3">{props.children}</div>
      </div>
    </div>
  );
}

function RatingField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{props.label}</label>
      <input
        type="number"
        min={0}
        max={10}
        step={1}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
