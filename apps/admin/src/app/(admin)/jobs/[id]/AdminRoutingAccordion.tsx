"use client";

import { useCallback, useEffect, useState } from "react";

type Certification = {
  certificationName: string;
  certificateImageUrl: string | null;
  verified: boolean;
  issuingOrganization: string | null;
};

type Contractor = {
  contractorId: string;
  businessName: string;
  contactName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  distanceKm: number;
  availabilityStatus: "AVAILABLE" | "BUSY";
  certifications: Certification[];
};

type JobMeta = {
  id: string;
  title: string;
  city: string;
  tradeCategory: string;
  countryCode: string;
  urbanOrRegional: "URBAN" | "REGIONAL";
};

type Props = {
  jobId: string;
  jobStatus: string;
  existingRouterId: string | null;
  adminRoutedById: string | null;
};

const ALLOWED_STATUSES = new Set(["OPEN_FOR_ROUTING", "APPRAISAL_PENDING"]);

function fmtDistance(distanceKm: number, countryCode: string): string {
  if (String(countryCode).toUpperCase() === "US") {
    return `${(distanceKm * 0.621371).toFixed(1)} mi`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

function AvailabilityBadge({ status }: { status: "AVAILABLE" | "BUSY" }) {
  const available = status === "AVAILABLE";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.04em",
        color: available ? "rgba(52,211,153,0.95)" : "rgba(251,191,36,0.9)",
        background: available ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)",
        border: `1px solid ${available ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}`,
      }}
    >
      {status}
    </span>
  );
}

function CertThumbnails({ certifications }: { certifications: Certification[] }) {
  const withImages = certifications.filter((c) => c.certificateImageUrl).slice(0, 3);
  if (!withImages.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
      {withImages.map((cert, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img
            src={cert.certificateImageUrl!}
            alt={cert.certificationName}
            title={cert.certificationName}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: "1px solid rgba(148,163,184,0.25)",
              objectFit: "cover",
            }}
          />
          {cert.verified && (
            <span
              title="Verified"
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "rgba(52,211,153,0.9)",
                borderRadius: "50%",
                width: 14,
                height: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                color: "#fff",
                fontWeight: 900,
              }}
            >
              ✓
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminRoutingAccordion({
  jobId,
  jobStatus,
  existingRouterId,
  adminRoutedById,
}: Props) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [jobMeta, setJobMeta] = useState<JobMeta | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isStatusAllowed = ALLOWED_STATUSES.has(jobStatus);
  const hasExistingActivity = Boolean(existingRouterId || adminRoutedById);

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const resp = await fetch(`/api/admin/v4/jobs/${encodeURIComponent(jobId)}/eligible-contractors`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setFetchError(String(json?.error?.message ?? json?.error ?? "Failed to load contractors"));
        return;
      }
      setJobMeta(json.data?.job ?? null);
      setContractors(Array.isArray(json.data?.contractors) ? json.data.contractors : []);
    } catch {
      setFetchError("Failed to load eligible contractors");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (enabled && open) void fetchContractors();
  }, [enabled, open, fetchContractors]);

  function toggleContractor(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = await fetch(`/api/admin/v4/jobs/${encodeURIComponent(jobId)}/route`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorIds: Array.from(selected),
          confirmOverride: confirmed,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? json?.error ?? "Failed to send invites");
        if (json?.error?.code === "ADMIN_ROUTE_CONFIRM_OVERRIDE_REQUIRED") {
          setSubmitError("This job already has routing activity. Check the confirmation box to proceed.");
        } else {
          setSubmitError(msg);
        }
        return;
      }
      setSuccess(`Invitations sent to ${selected.size} contractor${selected.size !== 1 ? "s" : ""}.`);
      setOpen(false);
      setEnabled(false);
      setSelected(new Set());
    } catch {
      setSubmitError("Failed to send invites");
    } finally {
      setSubmitting(false);
    }
  }

  const countryCode = jobMeta?.countryCode ?? "CA";

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 14,
        background: "rgba(2,6,23,0.30)",
        overflow: "hidden",
      }}
    >
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(226,232,240,0.95)",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 950, fontSize: 14 }}>Routing (Admin Override)</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.05em",
              padding: "2px 7px",
              borderRadius: 5,
              background: "rgba(251,191,36,0.15)",
              color: "rgba(253,224,71,0.9)",
              border: "1px solid rgba(251,191,36,0.3)",
            }}
          >
            ADMIN
          </span>
          {success && (
            <span style={{ fontSize: 12, color: "rgba(52,211,153,0.9)", fontWeight: 700 }}>{success}</span>
          )}
        </div>
        <span style={{ fontSize: 16, color: "rgba(226,232,240,0.5)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {/* Status gate */}
          {!isStatusAllowed && (
            <div
              style={{
                borderRadius: 8,
                background: "rgba(148,163,184,0.08)",
                border: "1px solid rgba(148,163,184,0.18)",
                padding: "10px 14px",
                fontSize: 13,
                color: "rgba(226,232,240,0.55)",
              }}
            >
              Admin routing override is only available when the job status is{" "}
              <code>OPEN_FOR_ROUTING</code> or <code>APPRAISAL_PENDING</code>. Current status:{" "}
              <code>{jobStatus}</code>
            </div>
          )}

          {isStatusAllowed && (
            <>
              {/* Enable toggle */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="radio"
                    name={`routing-enable-${jobId}`}
                    checked={!enabled}
                    onChange={() => setEnabled(false)}
                    style={{ accentColor: "rgba(148,163,184,0.8)" }}
                  />
                  <span style={{ color: "rgba(226,232,240,0.65)" }}>Disabled</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="radio"
                    name={`routing-enable-${jobId}`}
                    checked={enabled}
                    onChange={() => setEnabled(true)}
                    style={{ accentColor: "rgba(96,165,250,0.9)" }}
                  />
                  <span style={{ color: enabled ? "rgba(96,165,250,0.95)" : "rgba(226,232,240,0.65)", fontWeight: enabled ? 800 : 400 }}>
                    Enable Admin Routing
                  </span>
                </label>
              </div>

              {/* Existing activity warning */}
              {enabled && hasExistingActivity && (
                <div
                  style={{
                    borderRadius: 8,
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.3)",
                    padding: "10px 14px",
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  <div style={{ color: "rgba(253,224,71,0.9)", fontWeight: 800, marginBottom: 6 }}>
                    ⚠ This job already has routing activity.
                  </div>
                  <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, marginBottom: 8 }}>
                    Admin routing will send additional invites. Confirm to proceed.
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      style={{ accentColor: "rgba(251,191,36,0.9)", width: 14, height: 14 }}
                    />
                    <span style={{ color: "rgba(226,232,240,0.85)", fontWeight: 700 }}>
                      I understand — send override invites
                    </span>
                  </label>
                </div>
              )}

              {/* Contractor list */}
              {enabled && (
                <div>
                  {loading && (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(226,232,240,0.4)", fontSize: 13 }}>
                      Loading eligible contractors…
                    </div>
                  )}

                  {fetchError && (
                    <div
                      style={{
                        borderRadius: 8,
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "rgba(254,202,202,0.9)",
                        fontWeight: 700,
                      }}
                    >
                      {fetchError}
                      <button
                        type="button"
                        onClick={() => void fetchContractors()}
                        style={{
                          marginLeft: 10,
                          color: "rgba(191,219,254,0.9)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!loading && !fetchError && contractors.length === 0 && (
                    <div style={{ padding: "16px 0", color: "rgba(226,232,240,0.4)", fontSize: 13, textAlign: "center" }}>
                      No eligible contractors found for this job.
                    </div>
                  )}

                  {!loading && !fetchError && contractors.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: "rgba(226,232,240,0.45)", marginBottom: 8, fontWeight: 700 }}>
                        {contractors.length} eligible contractor{contractors.length !== 1 ? "s" : ""} · select up to 5
                      </div>

                      <div
                        style={{
                          maxHeight: "50vh",
                          overflowY: "auto",
                          display: "grid",
                          gap: 8,
                          paddingRight: 4,
                        }}
                      >
                        {contractors.map((c) => {
                          const isSelected = selected.has(c.contractorId);
                          const isDisabled = !isSelected && selected.size >= 5;
                          return (
                            <div
                              key={c.contractorId}
                              onClick={() => !isDisabled && toggleContractor(c.contractorId)}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                                borderRadius: 10,
                                border: `1px solid ${isSelected ? "rgba(96,165,250,0.5)" : "rgba(148,163,184,0.14)"}`,
                                background: isSelected ? "rgba(96,165,250,0.08)" : "rgba(2,6,23,0.25)",
                                padding: "10px 12px",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.45 : 1,
                                transition: "border-color 0.1s, background 0.1s",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isDisabled}
                                onChange={() => toggleContractor(c.contractorId)}
                                style={{ marginTop: 2, accentColor: "rgba(96,165,250,0.9)", width: 15, height: 15, flexShrink: 0 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(226,232,240,0.95)" }}>
                                    {c.businessName}
                                  </span>
                                  <AvailabilityBadge status={c.availabilityStatus} />
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.55)", marginTop: 2 }}>
                                  {c.city} · {fmtDistance(c.distanceKm, countryCode)} · {c.tradeCategory} · {c.yearsExperience} yr
                                  {c.yearsExperience !== 1 ? "s" : ""}
                                </div>
                                <CertThumbnails certifications={c.certifications} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Submit row */}
                      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
                        <button
                          type="button"
                          disabled={selected.size === 0 || submitting || (hasExistingActivity && !confirmed)}
                          onClick={() => void handleSubmit()}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(96,165,250,0.4)",
                            background:
                              selected.size === 0 || (hasExistingActivity && !confirmed)
                                ? "rgba(96,165,250,0.06)"
                                : "rgba(96,165,250,0.18)",
                            color: "rgba(191,219,254,0.95)",
                            padding: "9px 20px",
                            fontSize: 13,
                            fontWeight: 900,
                            cursor:
                              selected.size === 0 || submitting || (hasExistingActivity && !confirmed)
                                ? "not-allowed"
                                : "pointer",
                            opacity: selected.size === 0 || (hasExistingActivity && !confirmed) ? 0.5 : 1,
                          }}
                        >
                          {submitting
                            ? "Sending…"
                            : `Send Invites${selected.size > 0 ? ` (${selected.size})` : ""}`}
                        </button>

                        {selected.size > 0 && (
                          <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>
                            {selected.size} / 5 selected
                          </span>
                        )}

                        {submitError && (
                          <span style={{ fontSize: 12, color: "rgba(254,202,202,0.9)", fontWeight: 700 }}>
                            {submitError}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
