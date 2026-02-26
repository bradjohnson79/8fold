"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Thread = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  lastMessageAt: string;
};

export default function JobPosterMessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/messages/threads?role=job_poster", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { threads?: Thread[] };
          setThreads(Array.isArray(data.threads) ? data.threads : []);
        }
      } catch {
        setThreads([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Messages</h1>
      <p className="mt-1 text-gray-600">Thread list (left) — click a thread to view messages.</p>

      <div className="mt-6 max-w-2xl">
        {threads.length === 0 ? (
          <p className="text-gray-500">No message threads yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/dashboard/job-poster/messages/${t.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <span className="font-medium">{t.jobTitle ?? `Job ${t.jobId.slice(0, 8)}`}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {new Date(t.lastMessageAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
