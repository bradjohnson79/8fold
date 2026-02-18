import React from "react";
import styles from "../../app/(admin)/overview.module.css";

type FlaggedJob = {
  id: string;
  title: string | null;
  city: string | null;
  regionCode: string | null;
  flagCount: number;
};

export function FlaggedJobsCard(props: { jobs: FlaggedJob[] | null | undefined }) {
  const jobs = props.jobs ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Flagged Job Posts</div>
      <div className={styles.cardBody}>
        {jobs.length === 0 ? (
          <div style={{ color: "rgba(226,232,240,0.72)" }}>No flagged jobs.</div>
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
                <div style={{ fontWeight: 950 }}>{String(j.title ?? "—")}</div>
                <div style={{ marginTop: 4, color: "rgba(226,232,240,0.70)", fontSize: 12 }}>
                  {(j.city ? `${j.city}, ` : "") + (j.regionCode ?? "—")}
                </div>
                <div style={{ marginTop: 4, color: "rgba(254,202,202,0.95)", fontSize: 12, fontWeight: 900 }}>
                  {Number(j.flagCount ?? 0)} flags
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

