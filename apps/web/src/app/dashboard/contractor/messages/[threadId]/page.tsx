"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Message = {
  id: string;
  fromUserId: string;
  body: string;
  createdAt: string;
};

export default function ContractorMessageThreadPage() {
  const params = useParams();
  const threadId = params?.threadId as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchMessages = async () => {
    if (!threadId) return;
    const resp = await fetch(`/api/v4/messages/thread/${threadId}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (resp.ok) {
      const data = (await resp.json()) as { messages?: Message[] };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    }
  };

  const handleSend = async () => {
    if (!threadId || !body.trim() || sending) return;
    const msgBody = body.trim();
    setSending(true);
    try {
      const resp = await fetch(`/api/v4/messages/thread/${threadId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: msgBody }),
      });
      if (resp.ok) {
        setBody("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [threadId]);

  if (!threadId) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Invalid thread.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/dashboard/contractor/messages" className="text-blue-600 hover:underline text-sm">
        ← Back to threads
      </Link>
      <h1 className="text-2xl font-bold mt-2">Thread</h1>

      <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm text-gray-500">{new Date(m.createdAt).toLocaleString()}</p>
              <p className="mt-1">{m.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          rows={2}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
