"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";
import { formatNumber } from "@/lib/formatters";

type Stage = { stage: string; count: number };

export default function PipelinePage() {
  const [data, setData] = useState<Stage[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<{ data: Stage[] }>("/api/lgs/reports/pipeline")
      .then((r) => {
        if (r.ok && r.data) {
          const raw = r.data as { data?: Stage[] };
          setData(raw?.data ?? (raw as unknown as Stage[]));
        } else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Pipeline Report <HelpTooltip text={helpText.pipeline} />
      </h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
              <th style={{ padding: "0.75rem" }}>Stage</th>
              <th style={{ padding: "0.75rem" }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.stage} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "0.75rem" }}>{row.stage}</td>
                <td style={{ padding: "0.75rem" }}>{formatNumber(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/dashboard" style={{ display: "inline-block", marginTop: "1rem", color: "#94a3b8" }}>
        ← Dashboard
      </Link>
    </div>
  );
}
