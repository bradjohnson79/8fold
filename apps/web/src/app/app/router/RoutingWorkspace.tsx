"use client";

import React from "react";

type RoutableJob = {
  id: string;
  title: string;
  scope: string;
  region: string;
  tradeCategory: string;
  jobType: "urban" | "regional";
  postedAt: string;
  routerEarningsCents: number;
};

type EligibleContractor = {
  id: string;
  businessName: string;
  name: string;
  yearsExperience: number;
  trade: string;
  distanceKm: number | null;
  availability: "AVAILABLE" | "BUSY";
};

type RoutedJob = {
  id: string;
  title: string;
  region: string;
  tradeCategory: string;
  status: string;
  routedAt: string;
  claimedAt: string | null;
  contractor: { id: string; name: string } | null;
  routerEarningsCents: number;
  estimatedCompletionDate?: string | null;
};

type EarningsPayload = {
  projectedPendingCents: number;
  totals: Record<"PENDING" | "AVAILABLE" | "PAID" | "HELD", number>;
  paymentSchedule: { cadence: string; note: string };
  history: Array<{
    id: string;
    createdAt: string;
    type: string;
    bucket: string;
    direction: string;
    amountCents: number;
    memo: string | null;
    jobId: string | null;
  }>;
};

type PayoutMethodProvider = "STRIPE" | "PAYPAL" | string;

function payoutMethodLabel(provider: PayoutMethodProvider | null): string {
  if (provider === "STRIPE") return "Stripe (Direct Bank Deposit)";
  if (provider === "PAYPAL") return "PayPal";
  return "Pending";
}

function payoutStatusForRouter(opts: {
  provider: PayoutMethodProvider | null;
  totals: Record<"PENDING" | "AVAILABLE" | "PAID" | "HELD", number>;
  projectedPendingCents: number;
}): string {
  const hasPending = (opts.totals.PENDING ?? 0) > 0 || opts.projectedPendingCents > 0;
  const hasPaid = (opts.totals.PAID ?? 0) > 0;

  if (hasPaid) return "Sent — Payout initiated with provider";
  if (!hasPending) return "Pending";

  if (opts.provider === "PAYPAL") return "Scheduled — Awaiting PayPal payout run (clearing window)";
  if (opts.provider === "STRIPE") return "Processing — Stripe direct deposit initiated";
  return "Pending";
}

function payoutStatusSuffix(provider: PayoutMethodProvider | null, statusLine: string): string {
  if (provider === "PAYPAL" && statusLine.startsWith("Scheduled")) {
    return " (Clearing period up to 3+ business days)";
  }
  if (provider === "STRIPE" && statusLine.startsWith("Processing")) {
    return " (Direct deposit)";
  }
  return "";
}

type ProfilePayload = {
  router: {
    userId: string;
    email: string | null;
    homeCountry: string;
    homeRegionCode: string;
    isSeniorRouter: boolean;
    dailyRouteLimit: number;
    routesCompleted: number;
  };
  profile: { name: string | null; phone: string | null; notifyViaEmail: boolean; notifyViaSms: boolean; state: string | null };
};

type DispatchCreated = {
  dispatchId: string;
  contractorId: string;
  token?: string;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function parseCityProvince(region: string) {
  if (region.includes(", ")) {
    const [city, prov] = region.split(", ");
    return { city: city ?? region, prov: prov ?? "" };
  }
  if (region.includes("-")) {
    const parts = region.split("-").filter(Boolean);
    const prov = (parts[parts.length - 1] ?? "").toUpperCase();
    const city = parts
      .slice(0, -1)
      .join(" ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return { city: city || region, prov };
  }
  return { city: region, prov: "" };
}

async function safeJson<T>(resp: Response): Promise<T> {
  const text = await resp.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Request failed");
  }
}

function progressLabel(status: string, hasContractor: boolean) {
  if (!hasContractor && status === "PUBLISHED") return "Routed";
  if (hasContractor && status === "ASSIGNED") return "Claimed";
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "CUSTOMER_APPROVED") return "Completed (awaiting approval)";
  if (status === "COMPLETED_APPROVED") return "Completed";
  return status.replace(/_/g, " ");
}

const SENIOR_TARGET = 50;

export function RoutingWorkspace() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [notice, setNotice] = React.useState<string>("");

  // Available jobs
  const [availableJobs, setAvailableJobs] = React.useState<RoutableJob[]>([]);

  // Routing workspace modal
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  const [workspaceStep, setWorkspaceStep] = React.useState<"contractors" | "success">("contractors");
  const [selectedJob, setSelectedJob] = React.useState<RoutableJob | null>(null);
  const [contractors, setContractors] = React.useState<EligibleContractor[]>([]);
  const [selectedContractorIds, setSelectedContractorIds] = React.useState<string[]>([]);
  const [lastDispatches, setLastDispatches] = React.useState<DispatchCreated[]>([]);

  // Pending/progress
  const [routedJobs, setRoutedJobs] = React.useState<RoutedJob[]>([]);
  const pendingRef = React.useRef<HTMLDivElement | null>(null);
  const [highlightJobId, setHighlightJobId] = React.useState<string | null>(null);

  // Earnings & profile
  const [earnings, setEarnings] = React.useState<EarningsPayload | null>(null);
  const [profile, setProfile] = React.useState<ProfilePayload | null>(null);
  const [payoutMethod, setPayoutMethod] = React.useState<PayoutMethodProvider | null>(null);

  // Contact support modal
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportCategory, setSupportCategory] = React.useState<"SYSTEM" | "JOB" | "PAYMENT" | "OTHER">("JOB");
  const [supportJobId, setSupportJobId] = React.useState<string>("");
  const [supportSubject, setSupportSubject] = React.useState("");
  const [supportMessage, setSupportMessage] = React.useState("");
  const [supportNotice, setSupportNotice] = React.useState<string>("");


  async function loadAvailableJobs() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/routable-jobs", { cache: "no-store", credentials: "include" });
      const json = await safeJson<{ jobs: RoutableJob[]; error?: string }>(resp);
      if (!resp.ok) throw new Error(json.error || "Failed to load");
      setAvailableJobs(Array.isArray(json.jobs) ? json.jobs : []);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoutedJobs() {
    const resp = await fetch("/api/app/router/routed-jobs", { cache: "no-store", credentials: "include" });
    if (!resp.ok) return;
    const json = await safeJson<{ jobs: RoutedJob[] }>(resp);
    setRoutedJobs(Array.isArray(json.jobs) ? json.jobs : []);
  }

  async function loadEarnings() {
    const resp = await fetch("/api/app/router/earnings", { cache: "no-store", credentials: "include" });
    if (!resp.ok) return;
    const json = await safeJson<EarningsPayload>(resp);
    setEarnings(json);
  }

  async function loadPayoutMethod() {
    const resp = await fetch("/api/app/payout-methods", { cache: "no-store", credentials: "include" });
    if (!resp.ok) return;
    const json = await safeJson<any>(resp);
    const methods = Array.isArray(json?.methods) ? json.methods : [];
    const active = methods.find((m: any) => m?.isActive) ?? methods[0] ?? null;
    setPayoutMethod(active?.provider ?? null);
  }

  async function loadProfile() {
    const resp = await fetch("/api/app/router/profile", { cache: "no-store", credentials: "include" });
    if (!resp.ok) return;
    const json = await safeJson<ProfilePayload>(resp);
    setProfile(json);
  }

  async function openRoutingWorkspace(job: RoutableJob) {
    setLoading(true);
    setError("");
    setSupportNotice("");
    try {
      // Claim (locks "one active job") + load eligible contractors.
      const claim = await fetch(`/api/app/router/jobs/${job.id}/claim`, { method: "POST", credentials: "include" });
      if (!claim.ok) {
        const j = await safeJson<{ error?: string }>(claim);
        throw new Error(j.error || "Failed to claim job");
      }

      const resp = await fetch(`/api/app/router/jobs/${job.id}/eligible-contractors`, { cache: "no-store", credentials: "include" });
      const json = await safeJson<{ contractors: EligibleContractor[]; error?: string }>(resp);
      if (!resp.ok) throw new Error(json.error || "Failed to load contractors");

      setSelectedJob(job);
      setContractors(Array.isArray(json.contractors) ? json.contractors : []);
      setSelectedContractorIds([]);
      setWorkspaceStep("contractors");
      setWorkspaceOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open routing workspace");
    } finally {
      setLoading(false);
    }
  }

  async function routeToSelectedContractors() {
    if (!selectedJob) return;
    if (selectedContractorIds.length < 1 || selectedContractorIds.length > 5) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/apply-routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId: selectedJob.id, contractorIds: selectedContractorIds })
      });
      const json = await safeJson<{ ok?: boolean; error?: string; created?: DispatchCreated[] }>(resp);
      if (!resp.ok) throw new Error(json.error || "Failed to route");
      setLastDispatches(Array.isArray(json.created) ? json.created : []);

      await Promise.all([loadAvailableJobs(), loadRoutedJobs(), loadEarnings(), loadPayoutMethod()]);
      setWorkspaceStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to route job");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const resp = await fetch("/api/app/router/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: profile.profile?.name ?? undefined,
          phone: profile.profile?.phone ?? undefined,
          email: profile.router?.email ?? undefined,
          notifyViaEmail: profile.profile?.notifyViaEmail,
          notifyViaSms: profile.profile?.notifyViaSms
        })
      });
      const json = await safeJson<any>(resp);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to save profile");
      await loadProfile();
      setNotice("Saved profile.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  function supportCategoryToApiCategory(cat: typeof supportCategory) {
    if (cat === "PAYMENT") return "PAYOUTS";
    if (cat === "JOB") return "ROUTING";
    if (cat === "SYSTEM") return "OTHER";
    return "OTHER";
  }

  async function submitSupportTicket() {
    setLoading(true);
    setError("");
    setSupportNotice("");
    try {
      const subject = supportSubject.trim() || "Router support request";
      const jobRef = supportJobId.trim() ? `\n\nJob reference: ${supportJobId.trim()}` : "";
      const msg = (supportMessage.trim() || "No message provided.") + jobRef + `\n\nRouter ID: ${profile?.router?.userId ?? "—"}`;
      const resp = await fetch("/api/app/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: supportCategoryToApiCategory(supportCategory),
          subject,
          message: msg,
        }),
      });
      const json = await safeJson<any>(resp);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to create ticket");
      setSupportNotice("Ticket submitted.");
      setSupportOpen(false);
      setSupportSubject("");
      setSupportMessage("");
      setSupportJobId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create support ticket");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadAvailableJobs();
    void loadRoutedJobs();
    void loadEarnings();
    void loadProfile();
  }, []);

  React.useEffect(() => {
    if (!highlightJobId) return;
    const t = window.setTimeout(() => setHighlightJobId(null), 2500);
    return () => window.clearTimeout(t);
  }, [highlightJobId]);

  const projected = earnings?.projectedPendingCents ?? 0;
  const totals = earnings?.totals ?? { PENDING: 0, AVAILABLE: 0, PAID: 0, HELD: 0 };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-2xl font-extrabold text-gray-900">Router Dashboard</div>
          <div className="text-sm text-gray-600 mt-1">Route jobs to 1–5 contractors. Contractors self-assign (first come, first served).</div>
        </div>
        <button
          onClick={() => setSupportOpen(true)}
          className="bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2.5 rounded-xl"
        >
          Contact Support
        </button>
      </div>

      {error ? <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl px-4 py-3 text-sm">{error}</div> : null}
      {notice ? (
        <div className="border border-green-200 bg-green-50 text-green-800 rounded-xl px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      {supportNotice ? <div className="text-8fold-green font-semibold text-sm">{supportNotice}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-bold text-gray-900">1) Available Jobs</div>
                <div className="text-sm text-gray-600 mt-1">Paid, unrouted jobs within your regional eligibility.</div>
              </div>
              <button
                disabled={loading}
                onClick={() => void loadAvailableJobs()}
                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
              >
                Refresh
              </button>
        </div>

            {loading && availableJobs.length === 0 ? (
              <div className="text-gray-600 mt-3">Loading…</div>
            ) : availableJobs.length === 0 ? (
              <div className="mt-3 border border-gray-200 rounded-2xl p-6 text-center">
                <div className="text-lg font-bold text-gray-900">No eligible jobs right now</div>
                <div className="text-sm text-gray-600 mt-2">When paid jobs are published in your region, they’ll appear here.</div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableJobs.map((j) => {
                  const { city, prov } = parseCityProvince(j.region);
                  return (
                    <div key={j.id} className="border border-gray-200 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-3">
          <div>
                          <div className="text-lg font-bold text-gray-900">{j.title}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-semibold">{city}, {prov}</span> ·{" "}
                            <span className="font-semibold">{String(j.tradeCategory).replace(/_/g, " ")}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="uppercase">{j.jobType}</span> · Posted {new Date(j.postedAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-8fold-green text-white">
                          Available
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          Router earnings (preview): <span className="font-extrabold text-gray-900">{money(j.routerEarningsCents)}</span>
          </div>
          <button
                          disabled={loading}
                          onClick={() => void openRoutingWorkspace(j)}
                          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
                        >
                          Route Job
          </button>
        </div>
      </div>
                  );
                })}
              </div>
            )}
          </section>

          <section ref={pendingRef}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-bold text-gray-900">3) Pending Jobs & Progress (read-only)</div>
                <div className="text-sm text-gray-600 mt-1">Track outcomes of jobs you routed. No intervention or messaging.</div>
              </div>
          <button
            onClick={() => void loadRoutedJobs()}
                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            Refresh
          </button>
        </div>

        {routedJobs.length === 0 ? (
              <div className="text-sm text-gray-600 mt-3">No routed jobs yet.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {routedJobs.map((j) => {
              const { city, prov } = parseCityProvince(j.region);
                  const label = progressLabel(j.status, Boolean(j.contractor));
                  const highlight = highlightJobId === j.id;
              return (
                    <div
                      key={j.id}
                      className={
                        "border rounded-xl px-4 py-3 flex items-start justify-between gap-4 " +
                        (highlight ? "border-8fold-green bg-green-50" : "border-gray-200")
                      }
                    >
                  <div>
                    <div className="font-semibold text-gray-900">{j.title}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {city}, {prov} · {String(j.tradeCategory).replace(/_/g, " ")}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                          Contractor: <span className="font-semibold text-gray-900">{j.contractor?.name ?? "Not claimed yet"}</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          ETC:{" "}
                          <span className="font-semibold text-gray-900">{j.estimatedCompletionDate ? j.estimatedCompletionDate : "Not provided"}</span>
                    </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Routed: {new Date(j.routedAt).toLocaleString()}
                          {j.claimedAt ? ` · Claimed: ${new Date(j.claimedAt).toLocaleString()}` : ""}
                      </div>
                  </div>
                  <div className="shrink-0 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                      {label}
                    </span>
                        <div className="text-sm text-gray-700 mt-2">
                          Earnings: <span className="font-bold text-gray-900">{money(j.routerEarningsCents)}</span>
                        </div>
                        {j.status === "COMPLETED_APPROVED" ? (
                          <div className="mt-2 text-sm text-gray-700">
                            <div>
                              Payout Method:{" "}
                              <span className="font-semibold text-gray-900">{payoutMethodLabel(payoutMethod)}</span>
                            </div>
                            <div className="mt-1">
                              Payout Status:{" "}
                              <span className="font-semibold text-gray-900">
                                {payoutMethod === "PAYPAL"
                                  ? "Scheduled — Awaiting PayPal payout run (clearing window)"
                                  : payoutMethod === "STRIPE"
                                    ? "Processing — Stripe direct deposit initiated"
                                    : "Pending"}
                                {payoutMethod === "PAYPAL"
                                  ? " (Clearing period up to 3+ business days)"
                                  : payoutMethod === "STRIPE"
                                    ? " (Direct deposit)"
                                    : ""}
                              </span>
                            </div>
                          </div>
                        ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </section>

          <section>
            <div className="text-lg font-bold text-gray-900">5) Payments & Earnings</div>
            <div className="text-sm text-gray-600 mt-1">You only see your earnings. Contractor payouts are not shown.</div>

            <div className="mt-3 border border-gray-200 rounded-2xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="text-gray-700">
                  Payout Method:{" "}
                  <span className="font-semibold text-gray-900">{payoutMethodLabel(payoutMethod)}</span>
                </div>
                <div className="text-gray-700">
                  Payout Status:{" "}
                  <span className="font-semibold text-gray-900">
                    {payoutStatusForRouter({ provider: payoutMethod, totals, projectedPendingCents: projected })}
                    {payoutStatusSuffix(
                      payoutMethod,
                      payoutStatusForRouter({ provider: payoutMethod, totals, projectedPendingCents: projected })
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-2xl p-5">
                <div className="text-sm text-gray-600">Pending earnings (in progress)</div>
                <div className="text-3xl font-extrabold text-gray-900 mt-2">{money(projected)}</div>
              </div>
              <div className="border border-gray-200 rounded-2xl p-5">
                <div className="text-sm text-gray-600">Available</div>
                <div className="text-3xl font-extrabold text-gray-900 mt-2">{money(totals.AVAILABLE ?? 0)}</div>
              </div>
              <div className="border border-gray-200 rounded-2xl p-5">
                <div className="text-sm text-gray-600">Paid</div>
                <div className="text-3xl font-extrabold text-gray-900 mt-2">{money(totals.PAID ?? 0)}</div>
              </div>
            </div>

            {earnings?.paymentSchedule?.note ? (
              <div className="text-sm text-gray-600 mt-3">{earnings.paymentSchedule.note}</div>
            ) : null}

            <div className="mt-4 border border-gray-200 rounded-2xl p-4">
              <div className="font-bold text-gray-900">Earnings history</div>
              {earnings?.history?.length ? (
                <div className="mt-3 space-y-2">
                  {earnings.history.slice(0, 10).map((h) => (
                    <div key={h.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <div className="text-gray-700">
                        <span className="font-semibold">{h.type}</span> · {h.bucket} · {new Date(h.createdAt).toLocaleString()}
                        {h.jobId ? <span className="text-gray-500"> · Job {h.jobId.slice(0, 6)}…</span> : null}
                      </div>
                      <div className="font-bold text-gray-900">{money(h.amountCents)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600 mt-2">No earnings history yet.</div>
              )}
            </div>
          </section>

          <section>
            <div className="text-lg font-bold text-gray-900">6) Profile & Senior Router Progress</div>
            <div className="text-sm text-gray-600 mt-1">Region eligibility is system-controlled and read-only.</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <div className="text-sm font-medium text-gray-700">Name</div>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={profile?.profile?.name ?? ""}
                  onChange={(e) =>
                    setProfile((p) =>
                      p ? { ...p, profile: { ...(p.profile ?? {}), name: e.target.value } } : p
                    )
                  }
                  placeholder="Your name"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium text-gray-700">Email</div>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={profile?.router?.email ?? ""}
                  onChange={(e) =>
                    setProfile((p) =>
                      p ? { ...p, router: { ...(p.router ?? {}), email: e.target.value } } : p
                    )
                  }
                  placeholder="you@domain.com"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium text-gray-700">Phone</div>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={profile?.profile?.phone ?? ""}
                  onChange={(e) =>
                    setProfile((p) =>
                      p ? { ...p, profile: { ...(p.profile ?? {}), phone: e.target.value } } : p
                    )
                  }
                  placeholder="+1 555 123 4567"
                />
              </label>
              <div className="border border-gray-200 rounded-2xl p-4">
                <div className="text-xs text-gray-500">Router ID</div>
                <div className="font-mono text-sm text-gray-900 mt-1">{profile?.router?.userId ?? "—"}</div>
                <div className="text-xs text-gray-500 mt-3">Region eligibility</div>
                <div className="text-sm text-gray-900 mt-1">
                  {profile ? `${profile.router?.homeCountry ?? "—"}-${profile.router?.homeRegionCode ?? "—"}` : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(profile?.profile?.notifyViaEmail)}
                  onChange={(e) =>
                    setProfile((p) =>
                      p
                        ? { ...p, profile: { ...(p.profile ?? {}), notifyViaEmail: e.target.checked } }
                        : p
                    )
                  }
                />
                Notify via email
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(profile?.profile?.notifyViaSms)}
                  onChange={(e) =>
                    setProfile((p) =>
                      p ? { ...p, profile: { ...(p.profile ?? {}), notifyViaSms: e.target.checked } } : p
                    )
                  }
                />
                Notify via SMS
              </label>
              <button
                disabled={loading}
                onClick={() => void saveProfile()}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
              >
                Save profile
              </button>
            </div>

            <div className="mt-4 border border-gray-200 rounded-2xl p-4">
              <div className="font-bold text-gray-900">Senior Router Progress</div>
              <div className="text-sm text-gray-700 mt-2">
                Routes completed:{" "}
                <span className="font-extrabold text-gray-900">
                  {profile?.router?.routesCompleted ?? 0} / {SENIOR_TARGET}
                </span>
                {profile?.router?.isSeniorRouter ? (
                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-8fold-green text-white">
                    Senior Router
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-2">Progress is system-driven only. No manual promotion controls here.</div>
            </div>
          </section>
      </div>

        <div className="space-y-8">
          <section className="border border-gray-200 rounded-2xl p-5">
            <div className="text-lg font-bold text-gray-900">Daily limits</div>
            <div className="text-sm text-gray-600 mt-2">
              Daily route limit: <span className="font-semibold text-gray-900">{profile?.router?.dailyRouteLimit ?? "—"}</span>
            </div>
          </section>
        </div>
      </div>

      {workspaceOpen && selectedJob ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (loading) return;
              setWorkspaceOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="font-bold text-gray-900">
                  2) Routing Workspace{" "}
                  <span className="text-gray-500 font-semibold">
                    {workspaceStep === "contractors" ? "— Select contractors (1–5)" : ""}
                  </span>
                </div>
                <button
                  className="text-gray-700 hover:text-gray-900 font-semibold"
                  onClick={() => {
                    if (loading) return;
                    setWorkspaceOpen(false);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="p-5">
                {workspaceStep === "contractors" ? (
                  <>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{selectedJob.title}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {selectedJob.region} · {String(selectedJob.tradeCategory).replace(/_/g, " ")} ·{" "}
                          <span className="uppercase">{selectedJob.jobType}</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">Router earnings (fixed): {money(selectedJob.routerEarningsCents)}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">Selected: {selectedContractorIds.length} / 5</div>
                    </div>

                    <div className="mt-4 text-sm text-gray-600">Approved, trade-matching contractors within distance constraints are shown.</div>

                    {contractors.length === 0 ? (
                      <div className="mt-4 border border-gray-200 rounded-2xl p-6 text-center">
                        <div className="text-lg font-bold text-gray-900">No eligible contractors</div>
                        <div className="text-sm text-gray-600 mt-2">Try again later or expand coverage in ops.</div>
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {contractors.map((c) => {
                          const checked = selectedContractorIds.includes(c.id);
                          const atLimit = selectedContractorIds.length >= 5 && !checked;
                          return (
                            <label
                              key={c.id}
                              className={
                                "border rounded-2xl p-5 cursor-pointer select-none " +
                                (checked ? "border-8fold-green bg-green-50" : "border-gray-200") +
                                (atLimit ? " opacity-60" : "")
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-lg font-bold text-gray-900">{c.businessName}</div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    {c.trade.replace(/_/g, " ")} · {Math.round(c.yearsExperience)} yrs exp
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    Distance:{" "}
                                    <span className="font-semibold text-gray-900">
                                      {c.distanceKm == null ? "—" : `${Math.round(c.distanceKm)} km`}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={
                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold " +
                                    (c.availability === "AVAILABLE" ? "bg-8fold-green text-white" : "bg-yellow-100 text-yellow-800")
                                  }
                                >
                                  {c.availability === "AVAILABLE" ? "Available" : "Busy"}
                                </span>
                              </div>
                              <div className="mt-4 flex items-center justify-between">
                                <div className="text-sm text-gray-700 font-semibold">Select</div>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={atLimit}
                                  onChange={() => {
                                    setSelectedContractorIds((prev) => {
                                      if (prev.includes(c.id)) return prev.filter((x) => x !== c.id);
                                      if (prev.length >= 5) return prev;
                                      return [...prev, c.id];
                                    });
                                  }}
                                />
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <button
                        disabled={loading}
                        className="text-gray-700 hover:text-gray-900 font-semibold"
                        onClick={() => setWorkspaceOpen(false)}
                      >
                        ← Back
                      </button>
                      <button
                        disabled={loading || selectedContractorIds.length < 1}
                        onClick={() => void routeToSelectedContractors()}
                        className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-6 py-3 rounded-xl disabled:opacity-60"
                      >
                        Route to Selected Contractors
                      </button>
                    </div>
                  </>
                ) : null}

                {workspaceStep === "success" ? (
                  <div className="text-center py-8">
                    <div className="text-3xl font-extrabold text-gray-900">Routing sent</div>
                    <div className="text-gray-600 mt-3">
                      Contractors can self-assign. You now have read-only visibility in Pending Jobs & Progress.
                    </div>
                    {lastDispatches.some((d) => d.token) ? (
                      <div className="mt-6 border border-gray-200 rounded-2xl p-4 text-left">
                        <div className="font-bold text-gray-900">Dev: dispatch acceptance tokens</div>
                        <div className="text-sm text-gray-600 mt-2">
                          Use one token to simulate contractor self-assignment:
                          <span className="font-mono">POST /api/contractor/dispatch/respond</span>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          {lastDispatches
                            .filter((d) => d.token)
                            .map((d) => (
                              <div key={d.dispatchId} className="flex items-start justify-between gap-3">
                                <div className="text-gray-700">
                                  Contractor <span className="font-mono">{d.contractorId.slice(0, 6)}…</span>
                                </div>
                                <div className="font-mono font-semibold text-gray-900">{String(d.token)}</div>
                              </div>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-3">
                          Tip: include <span className="font-mono">estimatedCompletionDate</span> (YYYY-MM-DD) in the accept payload
                          to populate ETC in the Router dashboard.
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-6">
                      <button
                        className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-6 py-3 rounded-xl"
                        onClick={() => setWorkspaceOpen(false)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {supportOpen ? (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSupportOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="font-bold text-gray-900">Contact Support</div>
                <button className="text-gray-700 hover:text-gray-900 font-semibold" onClick={() => setSupportOpen(false)}>
                  Close
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm text-gray-600">
                  Prefilled: Router ID <span className="font-mono">{profile?.router?.userId ?? "—"}</span>
                </div>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Category</div>
                  <select
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={supportCategory}
                    onChange={(e) => setSupportCategory(e.target.value as any)}
                  >
                    <option value="SYSTEM">System issue</option>
                    <option value="JOB">Job issue</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Related job (optional)</div>
                  <select
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={supportJobId}
                    onChange={(e) => setSupportJobId(e.target.value)}
                  >
                    <option value="">No job reference</option>
                    {routedJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title} — {j.region} ({j.status})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Subject</div>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Short summary"
                    maxLength={160}
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Message</div>
                  <textarea
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[140px]"
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="Describe what happened and what you need."
                    maxLength={5000}
                  />
                </label>

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => void submitSupportTicket()}
                    disabled={loading}
                    className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
                  >
                    Submit ticket
                  </button>
                  <div className="text-xs text-gray-500">Support ticket updates will appear in Notifications.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

