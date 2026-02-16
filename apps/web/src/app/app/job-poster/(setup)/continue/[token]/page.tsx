"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";

type RedeemResp =
  | { ok: true; job: { id: string } }
  | { error?: string };

export default function JobPosterContinuePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const tokenRaw = (params as any)?.token;
        const token = String(Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw ?? "").trim();
        if (!token) throw new Error("Missing token");
        const resp = await fetch(`/api/app/job-poster/continue/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
        });
        const json = (await resp.json().catch(() => ({}))) as RedeemResp;
        if (!resp.ok) throw new Error((json as any)?.error ?? "Invalid or expired link");
        if (!alive) return;
        const jobId = (json as any)?.job?.id;
        if (!jobId) throw new Error("Missing job");
        router.replace(`/app/job-poster/post-a-job?resumeJobId=${encodeURIComponent(jobId)}`);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [params?.token, router]);

  return (
    <div className="max-w-xl mx-auto mt-10 border border-gray-200 rounded-xl p-5">
      <div className="text-lg font-bold text-gray-900">Continue Job Posting</div>
      <div className="text-sm text-gray-600 mt-2">
        {error ? error : "Validating your secure link…"}
      </div>
    </div>
  );
}

