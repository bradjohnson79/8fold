import React from "react";
import styles from "../../app/(admin)/overview.module.css";

type UrgentJob = {
  id: string;
  title: string;
  country: string;
  regionCode: string;
  city: string | null;
  createdAt: string;
};

export function RoutingUrgencyCard(props: {
  data: { count: number; jobs: UrgentJob[] } | null;
}) {
  const data = props.data;
  const jobs = data?.jobs ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Routing urgency</div>
      <div className={styles.cardBody}>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
          {data ? `${data.count} jobs past 24h awaiting routing` : "—"}
        </div>

        <div style={{ marginTop: 10 }}>
          {data && data.count === 0 ? (
            <div style={{ color: "rgba(226,232,240,0.72)" }}>No urgent jobs.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {jobs.slice(0, 5).map((j) => (
                <div
                  key={j.id}
                  style={{
                    border: "1px solid rgba(148,163,184,0.14)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(2,6,23,0.18)",
                  }}
                >
                  <div style={{ fontWeight: 950 }}>{j.title || "—"}</div>
                  <div style={{ marginTop: 4, color: "rgba(226,232,240,0.70)", fontSize: 12 }}>
                    {(j.city ? `${j.city}, ` : "") + (j.regionCode || "—")} · {j.country || "—"}
                  </div>
                  <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                    Created: {(j.createdAt || "").slice(0, 19).replace("T", " ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

