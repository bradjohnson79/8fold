"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "contractor" | "job-poster";

type ConversationRow = {
  id: string;
  jobId: string;
  contractorUserId: string;
  jobPosterUserId: string;
  createdAt: string;
  updatedAt: string;
  jobTitle?: string;
  jobStatus?: string;
};

type MessageRow = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderRole: string;
  body: string;
  createdAt: string;
};

export function MessagesClient({ role }: { role: Role }) {
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState("");

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  const roleLabel = role === "contractor" ? "Contractor" : "Job Poster";

  async function loadConversations() {
    setLoadingConvos(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/${role}/conversations`, { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to load conversations");
      const rows = Array.isArray(json?.conversations) ? (json.conversations as ConversationRow[]) : [];
      setConversations(rows);
      setSelectedId((prev) => prev ?? (rows[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingConvos(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setLoadingMsgs(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/${role}/conversations/${encodeURIComponent(conversationId)}/messages`, {
        cache: "no-store",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to load messages");
      const rows = Array.isArray(json?.messages) ? (json.messages as MessageRow[]) : [];
      setMessages(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingMsgs(false);
    }
  }

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedId]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const mySenderRole = role === "contractor" ? "CONTRACTOR" : "JOB_POSTER";

  async function send() {
    const text = draft.trim();
    if (!selectedId) return;
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/${role}/conversations/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to send");
      setDraft("");
      // Reload to keep ordering authoritative.
      await loadMessages(selectedId);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-3">
        <div className="border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50">
          <div className="p-4 flex items-center justify-between">
            <div className="font-bold text-gray-900">Conversations</div>
            <button
              onClick={() => void loadConversations()}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {loadingConvos ? (
            <div className="px-4 pb-4 text-sm text-gray-600">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="px-4 pb-4 text-sm text-gray-600">
              No conversations yet. A conversation is created when a contractor accepts a job and/or submits an appointment.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {conversations.map((c) => {
                const active = c.id === selectedId;
                const title = c.jobTitle ? c.jobTitle : `Job ${c.jobId.slice(0, 8)}…`;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-white ${
                      active ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Updated {new Date(c.updatedAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col min-h-[420px]">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="font-bold text-gray-900">{roleLabel} Messages</div>
            <div className="text-sm text-gray-600 mt-1">
              {selected ? (selected.jobTitle ? selected.jobTitle : `Job ${selected.jobId}`) : "Select a conversation to view messages."}
            </div>
          </div>

          {error ? (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-700 text-sm">{error}</div>
          ) : null}

          <div className="flex-1 bg-white p-4 overflow-y-auto">
            {!selectedId ? (
              <div className="text-sm text-gray-600">No conversation selected.</div>
            ) : loadingMsgs ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-gray-600">
                No messages yet. The first system message appears when the contractor submits an appointment window.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isMe = String(m.senderRole).toUpperCase() === mySenderRole;
                  const isSystem = String(m.senderRole).toUpperCase() === "SYSTEM";
                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[90%] bg-gray-100 border border-gray-200 text-gray-800 text-sm px-3 py-2 rounded-xl">
                          <div className="whitespace-pre-wrap break-words">{m.body}</div>
                          <div className="text-[11px] text-gray-500 mt-1 text-center">{new Date(m.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                          isMe
                            ? "bg-8fold-green text-white rounded-br-sm"
                            : "bg-gray-200 text-gray-900 rounded-bl-sm"
                        }`}
                      >
                        <div>{m.body}</div>
                        <div className={`text-[11px] mt-1 ${isMe ? "text-white/80" : "text-gray-600"}`}>
                          {new Date(m.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2 items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!selectedId || sending}
                rows={2}
                placeholder={selectedId ? "Type a message…" : "Messaging is unavailable until a conversation exists."}
                className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-8fold-green"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                onClick={() => void send()}
                disabled={!selectedId || sending || draft.trim().length === 0}
                className="px-4 py-2 rounded-xl font-semibold bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Email addresses are blocked. Phone numbers are allowed. Plain text only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

