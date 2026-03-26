"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import confetti from "canvas-confetti";
import { apiFetch } from "@/lib/routerApi";
import { DeadlineCountdown, InviteCountdown } from "@/components/dashboard/LiveCountdown";
import { loadSection, readJsonResponse } from "@/components/dashboard/loadSection";
import { useContractorReadiness } from "@/hooks/useContractorReadiness";
type AwaitingCompletion = {
  jobId: string;
  title: string | null;
  completionWindowExpiresAt: string | null;
};

type CompletedJob = {
  jobId: string;
  title: string | null;
  completedAt: string | null;
  payoutStatus: string | null;
  contractorPayoutCents: number | null;
};

type SummaryData = {
  pendingInvites: number;
  assignedJobsCount: number;
  completedJobsCount: number;
  awaitingPosterCompletion?: AwaitingCompletion[];
  fullyCompletedJobs?: CompletedJob[];
};

type InvitePreview = {
  inviteId: string;
  jobId: string;
  jobTitle: string;
  tradeCategory: string;
  address: string;
  expiresAt: string;
};

function GateCard({
  label,
  done,
  href,
  compact,
}: {
  label: string;
  done: boolean;
  href: string;
  compact: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-emerald-700"
      >
        <span className="text-emerald-600">&#10003;</span>
        {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-md " +
        (done
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50")
      }
    >
      <span
        className={
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold " +
          (done
            ? "bg-emerald-600 text-white"
            : "bg-amber-400 text-white")
        }
      >
        {done ? "\u2713" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className={"text-xs " + (done ? "text-emerald-700" : "text-amber-700")}>
          {done ? "Complete" : "Action required"}
        </div>
      </div>
    </Link>
  );
}

function SummaryCard({ title, value, subtitle, href }: { title: string; value: string; subtitle: string; href?: string }) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function SummaryCardSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function DegradedStateBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Some data failed to load. Please refresh.
    </div>
  );
}

const DEBUG = typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === "true";

export default function ContractorOverviewClient() {
  const { getToken } = useAuth();
  const { readiness, loading: readinessLoading, error: readinessError } = useContractorReadiness();
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [invitePreviews, setInvitePreviews] = useState<InvitePreview[]>([]);
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null);
  const confettiFired = useRef(false);
  const [zeroApprovedTrades, setZeroApprovedTrades] = useState(false);
  const [sectionFailures, setSectionFailures] = useState({
    summary: false,
    invites: false,
    trades: false,
  });

  useEffect(() => {
    if (readinessLoading) return;
    let alive = true;
    (async () => {
      try {
        const [summaryResult, invitesResult, tradesResult] = await Promise.all([
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/contractor/dashboard/summary", getToken);
            if (!resp.ok) throw new Error(`Summary request failed with ${resp.status}`);
            return await readJsonResponse<SummaryData>(resp);
          }, { section: "contractor-summary", route: "/api/web/v4/contractor/dashboard/summary" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/contractor/invites", getToken);
            if (!resp.ok) throw new Error(`Invites request failed with ${resp.status}`);
            return await readJsonResponse<{ invites?: Array<any> }>(resp);
          }, { section: "contractor-invites", route: "/api/web/v4/contractor/invites" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/contractor/trades", getToken);
            if (!resp.ok) throw new Error(`Trades request failed with ${resp.status}`);
            return await readJsonResponse<{ ok?: boolean; trades?: Array<{ approved: boolean }> }>(resp);
          }, { section: "contractor-trades", route: "/api/web/v4/contractor/trades" }),
        ]);
        if (!alive) return;

        const summaryJson = summaryResult.data;
        const invitesJson = invitesResult.data;
        const tradesJson = tradesResult.data;

        setSectionFailures({
          summary: summaryResult.failed,
          invites: invitesResult.failed,
          trades: tradesResult.failed,
        });

        setSummary(summaryJson);

        // Check if contractor has zero approved trades (suspended warning)
        if (tradesJson?.ok && Array.isArray(tradesJson.trades)) {
          const hasApproved = (tradesJson.trades as Array<{ approved: boolean }>).some((t) => t.approved);
          // Only show banner if they have trade records but none are approved
          if (tradesJson.trades.length > 0 && !hasApproved) {
            setZeroApprovedTrades(true);
          }
        }

        const rawInvites: InvitePreview[] = Array.isArray(invitesJson?.invites)
          ? invitesJson.invites
              .filter((inv: any) => new Date(inv.expiresAt).getTime() > Date.now())
              .slice(0, 5)
              .map((inv: any) => ({
                inviteId: inv.inviteId,
                jobId: inv.jobId,
                jobTitle: inv.jobTitle ?? "Untitled Job",
                tradeCategory: inv.tradeCategory ?? "",
                address: inv.address ?? "",
                expiresAt: inv.expiresAt,
              }))
          : [];
        setInvitePreviews(rawInvites);

        if (rawInvites.length > 0 && !confettiFired.current) {
          confettiFired.current = true;
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        }

        if (DEBUG) {
          setDebugData({
            summaryKeys: summaryJson ? Object.keys(summaryJson) : [],
            pendingInvites: summaryJson?.pendingInvites,
            assignedJobsCount: summaryJson?.assignedJobsCount,
            inviteCount: rawInvites.length,
          });
        }
      } catch {
        if (alive) setError("Failed to load dashboard data");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [readinessLoading, getToken]);

  const loading = readinessLoading || dataLoading;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }

  if (readinessError || error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {readinessError || error}
        </div>
      </div>
    );
  }

  const termsOk = readiness?.terms ?? false;
  const profileOk = readiness?.profile ?? false;
  const paymentOk = readiness?.payment ?? false;
  const allGatesComplete = readiness?.complete ?? false;

  const pendingInvites = summary?.pendingInvites ?? 0;
  const assignedJobs = summary?.assignedJobsCount ?? 0;
  const completedJobsCount = summary?.completedJobsCount ?? 0;
  const criticalSectionFailed = sectionFailures.summary;

  const showCompletedActions =
    (summary?.awaitingPosterCompletion ?? []).length > 0 || (summary?.fullyCompletedJobs ?? []).length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contractor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Track your jobs, invites, and support activity.</p>
      </div>

      {criticalSectionFailed ? <DegradedStateBanner /> : null}

      {zeroApprovedTrades ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="text-lg text-amber-500 mt-0.5">⚠</span>
            <div>
              <div className="text-sm font-semibold text-amber-800">Your account is temporarily inactive.</div>
              <div className="mt-0.5 text-sm text-amber-700">
                At least one trade requires 3+ years of experience to qualify for routing.
                Update your trade experience to activate your account.
              </div>
              <Link
                href="/dashboard/contractor/profile"
                className="mt-2 inline-block text-sm font-semibold text-amber-800 underline hover:text-amber-900"
              >
                Update Trade Skills →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {allGatesComplete ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <GateCard label="Terms" done href="/dashboard/contractor/terms" compact />
            <GateCard label="Profile" done href="/dashboard/contractor/profile" compact />
            <GateCard label="Payment" done href="/dashboard/contractor/payment" compact />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-700">
            Account setup complete &mdash; ready for jobs
          </div>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Complete Your Setup</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <GateCard label="Terms" done={termsOk} href="/dashboard/contractor/terms" compact={false} />
            <GateCard label="Profile Setup" done={profileOk} href="/dashboard/contractor/profile" compact={false} />
            <GateCard label="Payment Setup" done={paymentOk} href="/dashboard/contractor/payment" compact={false} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {sectionFailures.summary ? (
          <>
            <SummaryCardSkeleton title="In Progress Jobs" />
            <SummaryCardSkeleton title="Jobs Completed" />
          </>
        ) : (
          <>
            <SummaryCard
              title="In Progress Jobs"
              value={String(assignedJobs)}
              subtitle="Active assigned jobs"
              href="/dashboard/contractor/jobs"
            />
            <SummaryCard
              title="Jobs Completed"
              value={String(completedJobsCount)}
              subtitle="Total completed jobs"
              href="/dashboard/contractor/jobs"
            />
          </>
        )}
        {invitePreviews.length === 0 ? (
          sectionFailures.summary || sectionFailures.invites ? (
            <SummaryCardSkeleton title="Pending Invites" />
          ) : (
            <SummaryCard
              title="Pending Invites"
              value={String(pendingInvites)}
              subtitle={pendingInvites > 0 ? "Job invitations waiting" : "No pending invites"}
              href="/dashboard/contractor/invites"
            />
          )
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-2xl" role="img" aria-label="celebration">
                  🎉
                </span>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Congratulations!</h3>
                <p className="text-sm text-slate-600">
                  You&apos;ve been invited to {invitePreviews.length === 1 ? "a new job" : `${invitePreviews.length} new jobs`}.
                </p>
              </div>
              <Link
                href="/dashboard/contractor/invites"
                className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View Invites &rarr;
              </Link>
            </div>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
              {invitePreviews.map((inv) => (
                <div key={inv.inviteId} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                  <div className="font-medium text-slate-800 text-sm leading-snug">{inv.jobTitle}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {inv.address ? <span>{inv.address}</span> : null}
                    {inv.address && inv.tradeCategory ? <span>&middot;</span> : null}
                    {inv.tradeCategory ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {inv.tradeCategory}
                      </span>
                    ) : null}
                    <span>&middot;</span>
                    <InviteCountdown expiresAt={inv.expiresAt} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {sectionFailures.summary ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Completed Job Actions</h3>
          <p className="mt-1 text-sm text-slate-600">Completed job actions are temporarily unavailable.</p>
        </section>
      ) : showCompletedActions ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Completed Job Actions</h3>
          <p className="mt-1 text-sm text-slate-600">Track completion reports and fund releases.</p>
          <div className="mt-3 space-y-3">
            {(summary?.awaitingPosterCompletion ?? []).map((j) => (
              <div key={j.jobId} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{j.title ?? "Untitled Job"}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Completion Reports: <span className="font-semibold text-amber-700">1 / 2</span> &middot; Waiting for Job Poster
                    </div>
                    {j.completionWindowExpiresAt && (
                      <div className="mt-1.5 text-xs font-medium text-amber-700">
                        Funds releasable in: <DeadlineCountdown targetIso={j.completionWindowExpiresAt} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      1/2
                    </span>
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Waiting for Job Poster
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {(summary?.fullyCompletedJobs ?? []).map((j) => (
              <div key={j.jobId} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{j.title ?? "Untitled Job"}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Completion Reports: <span className="font-semibold text-emerald-700">2 / 2</span>
                      {" "}&middot; Completed {j.completedAt ? new Date(j.completedAt).toLocaleDateString() : ""}
                      {j.contractorPayoutCents ? <span> &middot; Payout: ${(j.contractorPayoutCents / 100).toFixed(2)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      2/2
                    </span>
                    {j.payoutStatus === "RELEASED" ? (
                      <span className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                        PAID
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Pending Release
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/dashboard/contractor/support/inbox"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Support</div>
            <div className="mt-1 text-sm text-slate-600">Submit or view support tickets</div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
      </div>

      {DEBUG && debugData ? (
        <details className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Debug Panel</summary>
          <pre className="mt-2 overflow-auto">{JSON.stringify(debugData, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
