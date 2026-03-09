import { adminApiFetch } from "@/server/adminApiV4";
import { redirect } from "next/navigation";
import React from "react";

type JobRef = { id: string; title: string; statusRaw: string; displayStatus: string; createdAt: string; updatedAt: string; amountCents: number };
type CertRef = {
  id: string;
  certificationName: string;
  issuingOrganization: string | null;
  certificateImageUrl: string | null;
  certificateType: string | null;
  issuedAt: string | null;
  verified: boolean;
};
type TradeRef = {
  id: string;
  tradeCategory: string;
  yearsExperience: number;
  approved: boolean;
  certifications: CertRef[];
};
type DetailResp = {
  profile: {
    id: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    regionCode: string | null;
    city: string | null;
    serviceRegion: string | null;
    verification: { termsAccepted: boolean | null; profileComplete: boolean | null; approved: boolean | null };
    paymentSetup: { hasPayoutMethod: boolean; stripeConnected: boolean; payoutStatus: string | null };
    metadata: Record<string, unknown>;
  };
  accountStatus: {
    status: string;
    suspendedUntil: string | null;
    suspensionReason: string | null;
    archivedAt: string | null;
    archivedReason: string | null;
    disabled: boolean;
    lastLoginAt: string | null;
  };
  recentJobs: JobRef[];
  payoutReadiness: { hasPayoutMethod: boolean; stripeConnected: boolean; eligible: boolean; blockers: string[] };
  enforcement: { strikes?: number; flags?: number; suspendedUntil?: string | null; archivedAt?: string | null };
};

function toActionError(error: unknown): string {
  const status = typeof (error as any)?.status === "number" ? (error as any).status : null;
  const msg = error instanceof Error ? error.message : "Action failed";
  return `${status ? `HTTP ${status}: ` : ""}${msg}`.slice(0, 240);
}

async function doVerifyCertification(certificationId: string, verified: boolean, contractorId: string) {
  "use server";
  try {
    await adminApiFetch(`/api/admin/v4/contractor/certifications/verify`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, verified }),
    });
    redirect(`/contractors/${encodeURIComponent(contractorId)}?certVerified=1`);
  } catch (error) {
    redirect(
      `/contractors/${encodeURIComponent(contractorId)}?certVerifyError=${encodeURIComponent(toActionError(error))}`,
    );
  }
}

async function doRefreshStripe(contractorUserId: string) {
  "use server";
  try {
    await adminApiFetch(`/api/admin/v4/contractors/${encodeURIComponent(contractorUserId)}/stripe/refresh`, {
      method: "POST",
    });
    redirect(`/contractors/${encodeURIComponent(contractorUserId)}?stripeRefreshed=1`);
  } catch (error) {
    redirect(
      `/contractors/${encodeURIComponent(contractorUserId)}?stripeRefreshError=${encodeURIComponent(toActionError(error))}`,
    );
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 14, background: "rgba(2,6,23,0.35)" }}>
      <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>{title}</div>
      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.90)" }}>{children}</div>
    </div>
  );
}

function kv(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10, padding: "6px 0" }}>
      <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(226,232,240,0.92)" }}>{value}</div>
    </div>
  );
}

function fmt(v: string | null | undefined) {
  return v ? v.slice(0, 19).replace("T", " ") : "—";
}

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default async function ContractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const stripeRefreshed = String(Array.isArray(sp.stripeRefreshed) ? sp.stripeRefreshed[0] : sp.stripeRefreshed ?? "");
  const stripeRefreshError = String(
    Array.isArray(sp.stripeRefreshError) ? sp.stripeRefreshError[0] : sp.stripeRefreshError ?? "",
  );
  const certVerified = String(Array.isArray(sp.certVerified) ? sp.certVerified[0] : sp.certVerified ?? "");
  const certVerifyError = String(Array.isArray(sp.certVerifyError) ? sp.certVerifyError[0] : sp.certVerifyError ?? "");

  let data: DetailResp | null = null;
  let err: string | null = null;
  let trades: TradeRef[] = [];
  try {
    [data] = await Promise.all([
      adminApiFetch<DetailResp>(`/api/admin/v4/contractors/${encodeURIComponent(id)}`),
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load contractor";
  }
  // Trades are fetched separately so a failure doesn't break the whole page
  try {
    const tradesResp = await adminApiFetch<{ trades: TradeRef[] }>(`/api/admin/v4/contractors/${encodeURIComponent(id)}/trades`);
    trades = tradesResp?.trades ?? [];
  } catch {
    // non-fatal — trades section will show empty
  }

  if (!data || err) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Contractor</h1>
        <p style={{ marginTop: 10, color: "rgba(254,202,202,0.95)" }}>{err ?? "Failed to load"}</p>
        <a href="/contractors" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
          ← Back to Contractors
        </a>
      </div>
    );
  }

  const p = data.profile;
  const a = data.accountStatus;

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Contractor Detail</h1>
      <div style={{ marginTop: 6 }}>
        <a href="/contractors" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
          ← Back
        </a>
      </div>
      {stripeRefreshed === "1" ? (
        <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontWeight: 900, fontSize: 12 }}>
          Stripe status refreshed from Stripe API.
        </div>
      ) : null}
      {stripeRefreshError ? (
        <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900, fontSize: 12 }}>
          {stripeRefreshError}
        </div>
      ) : null}
      {certVerified === "1" ? (
        <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontWeight: 900, fontSize: 12 }}>
          Certification verification updated.
        </div>
      ) : null}
      {certVerifyError ? (
        <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900, fontSize: 12 }}>
          {certVerifyError}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Profile">
          {kv("Name", p.name ?? "—")}
          {kv("Email", p.email ?? "—")}
          {kv("Phone", p.phone ?? "—")}
          {kv("Country", p.country ?? "—")}
          {kv("Region", p.regionCode ?? "—")}
          {kv("City", p.city ?? "—")}
          {kv("Service region", p.serviceRegion ?? "—")}
        </Card>

        <Card title="Account Status">
          {kv("Status", a.status)}
          {kv("Suspended until", fmt(a.suspendedUntil))}
          {kv("Suspension reason", a.suspensionReason ?? "—")}
          {kv("Archived at", fmt(a.archivedAt))}
          {kv("Archived reason", a.archivedReason ?? "—")}
          {kv("Last login", fmt(a.lastLoginAt))}
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Verification / Setup">
          {kv("Terms accepted", String(p.verification.termsAccepted))}
          {kv("Profile complete", String(p.verification.profileComplete))}
          {kv("Approved", String(p.verification.approved))}
          {kv("Payout method", p.paymentSetup.hasPayoutMethod ? "Configured" : "Missing")}
          {kv("Stripe connected", p.paymentSetup.stripeConnected ? "Yes" : "No")}
          {kv("Payout status", p.paymentSetup.payoutStatus ?? "—")}
          <div style={{ marginTop: 10 }}>
            <form action={doRefreshStripe.bind(null, id)}>
              <button
                type="submit"
                style={{
                  border: "1px solid rgba(148,163,184,0.24)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(15,23,42,0.45)",
                  color: "rgba(191,219,254,0.95)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                Refresh Stripe Status
              </button>
            </form>
          </div>
        </Card>

        <Card title="Payout Readiness">
          {kv("Eligible", data.payoutReadiness.eligible ? "Yes" : "No")}
          {kv("Has payout method", data.payoutReadiness.hasPayoutMethod ? "Yes" : "No")}
          {kv("Stripe connected", data.payoutReadiness.stripeConnected ? "Yes" : "No")}
          {kv("Blockers", data.payoutReadiness.blockers.length ? data.payoutReadiness.blockers.join(", ") : "None")}
        </Card>

        <Card title="Enforcement">
          {kv("Strikes", String(data.enforcement.strikes ?? 0))}
          {kv("Flags", String(data.enforcement.flags ?? 0))}
          {kv("Suspended until", fmt(data.enforcement.suspendedUntil))}
          {kv("Archived at", fmt(data.enforcement.archivedAt))}
          <div style={{ marginTop: 10 }}>
            <a href={`/users/${encodeURIComponent(id)}`} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900, fontSize: 12 }}>
              Open Full Enforcement Controls (suspend/archive/delete)
            </a>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Trade Skills &amp; Certifications">
          {trades.length === 0 ? (
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 13 }}>No trade skills declared.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {trades.map((trade) => (
                <div key={trade.id} style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 10, background: "rgba(15,23,42,0.25)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 900, fontSize: 13, color: "rgba(226,232,240,0.92)" }}>
                      {trade.tradeCategory.replace(/_/g, " ")}
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: 8,
                      background: trade.approved ? "rgba(22,163,74,0.18)" : "rgba(245,158,11,0.18)",
                      color: trade.approved ? "rgba(134,239,172,0.95)" : "rgba(253,230,138,0.95)",
                    }}>
                      {trade.approved ? "Approved" : "Not Approved"}
                    </span>
                  </div>
                  {kv("Years Experience", String(trade.yearsExperience))}
                  {trade.certifications.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      {trade.certifications.map((cert) => (
                        <div key={cert.id} style={{ marginTop: 6, padding: "6px 8px", background: "rgba(15,23,42,0.35)", borderRadius: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(226,232,240,0.92)", marginBottom: 4 }}>
                            {cert.certificationName}
                            {cert.verified ? (
                              <span style={{ marginLeft: 6, color: "rgba(134,239,172,0.95)" }}>✔ Verified</span>
                            ) : (
                              <span style={{ marginLeft: 6, color: "rgba(253,230,138,0.90)" }}>Unverified</span>
                            )}
                          </div>
                          {cert.issuingOrganization ? (
                            <div style={{ fontSize: 11, color: "rgba(226,232,240,0.65)" }}>{cert.issuingOrganization}</div>
                          ) : null}
                          {cert.certificateImageUrl ? (
                            <div style={{ marginTop: 4 }}>
                              <a
                                href={cert.certificateImageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "rgba(191,219,254,0.90)", fontSize: 11, textDecoration: "none", fontWeight: 800 }}
                              >
                                View Certificate ({cert.certificateType ?? "file"}) ↗
                              </a>
                            </div>
                          ) : null}
                          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                            {!cert.verified ? (
                              <form action={doVerifyCertification.bind(null, cert.id, true, id)}>
                                <button type="submit" style={{ border: "1px solid rgba(134,239,172,0.3)", borderRadius: 6, padding: "4px 8px", background: "rgba(22,163,74,0.15)", color: "rgba(134,239,172,0.95)", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                                  Mark Verified
                                </button>
                              </form>
                            ) : (
                              <form action={doVerifyCertification.bind(null, cert.id, false, id)}>
                                <button type="submit" style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 6, padding: "4px 8px", background: "rgba(15,23,42,0.45)", color: "rgba(253,230,138,0.90)", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                                  Revoke Verification
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(226,232,240,0.50)" }}>No certification uploaded.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Recent Jobs">
          {data.recentJobs.length === 0 ? (
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 13 }}>No jobs yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["Job", "Status", "Created", "Updated", "Amount"].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 12, padding: "8px 8px", color: "rgba(226,232,240,0.70)", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={cellStyle}>
                        <a href={`/jobs/${encodeURIComponent(j.id)}`} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
                          {j.title}
                        </a>
                      </td>
                      <td style={cellStyle}>{j.displayStatus}</td>
                      <td style={cellStyle}>{fmt(j.createdAt)}</td>
                      <td style={cellStyle}>{fmt(j.updatedAt)}</td>
                      <td style={cellStyle}>{money(j.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "8px 8px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
};
