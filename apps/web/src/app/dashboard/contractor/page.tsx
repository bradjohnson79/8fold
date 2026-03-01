"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Invite = {
  inviteId: string;
  jobId: string;
  jobTitle?: string;
  jobDescription?: string;
  address?: string;
  createdAt: string;
  expiresAt?: string;
};

type JobSummary = {
  id: string;
  title?: string;
  scope?: string;
  region?: string;
  status: string;
  assignedAt: string;
};

type AccountStatus = {
  strikeCount: number;
  activeSuspension?: { suspendedUntil: string; reason?: string | null } | null;
};

type ReadinessResponse = {
  paymentSetupComplete?: boolean;
  roleCompletion?: {
    payment?: boolean;
  } | null;
};

type InviteListResponse = {
  serverTime?: string;
  invites?: Invite[];
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function statusBadgeClasses(status: string) {
  const s = status.toUpperCase();
  if (s.includes("INVIT")) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (s.includes("ACCEPT")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (s.includes("PROGRESS") || s.includes("ASSIGN")) return "bg-sky-50 text-sky-700 ring-sky-200";
  if (s.includes("PM") || s.includes("MATERIAL")) return "bg-orange-50 text-orange-700 ring-orange-200";
  if (s.includes("COMPLETE")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function normalizeStatusLabel(status: string) {
  const s = status.toUpperCase();
  if (s.includes("INVIT")) return "Invited";
  if (s.includes("ACCEPT")) return "Accepted";
  if (s.includes("PROGRESS") || s.includes("ASSIGN")) return "In Progress";
  if (s.includes("PM") || s.includes("MATERIAL")) return "Awaiting P&M";
  if (s.includes("COMPLETE")) return "Completed";
  return status || "Unknown";
}

export default function ContractorOverviewPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [assignedJobs, setAssignedJobs] = useState<JobSummary[]>([]);
  const [completedJobs, setCompletedJobs] = useState<JobSummary[]>([]);
  const [paymentSetupComplete, setPaymentSetupComplete] = useState<boolean>(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [inviteCountResp, invResp, assignedResp, completedResp, statusResp, readinessResp] = await Promise.all([
          fetch("/api/contractor/invites/count", { cache: "no-store", credentials: "include" }),
          fetch("/api/contractor/invites", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/contractor/jobs?status=assigned", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/contractor/jobs?status=completed", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/contractor/account-status", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/readiness", { cache: "no-store", credentials: "include" }),
        ]);

        if (inviteCountResp.ok) {
          const countData = (await inviteCountResp.json()) as { count?: number };
          setPendingInviteCount(Number(countData.count ?? 0));
        }

        if (invResp.ok) {
          const invData = (await invResp.json()) as Invite[] | InviteListResponse;
          const parsedInvites = Array.isArray(invData)
            ? invData
            : Array.isArray(invData?.invites)
              ? invData.invites
              : [];
          setInvites(parsedInvites);
          if (!inviteCountResp.ok) setPendingInviteCount(parsedInvites.length);
        }

        if (assignedResp.ok) {
          const data = (await assignedResp.json()) as { jobs?: JobSummary[] };
          setAssignedJobs(Array.isArray(data.jobs) ? data.jobs : []);
        }

        if (completedResp.ok) {
          const data = (await completedResp.json()) as { jobs?: JobSummary[] };
          setCompletedJobs(Array.isArray(data.jobs) ? data.jobs : []);
        }

        if (statusResp.ok) {
          const data = (await statusResp.json()) as AccountStatus;
          setAccountStatus(data);
        }

        if (readinessResp.ok) {
          const data = (await readinessResp.json()) as ReadinessResponse;
          const computed = Boolean(data.paymentSetupComplete ?? data.roleCompletion?.payment);
          setPaymentSetupComplete(computed);
        } else {
          setPaymentSetupComplete(false);
        }
      } catch {
        setInvites([]);
        setPendingInviteCount(0);
        setAssignedJobs([]);
        setCompletedJobs([]);
        setPaymentSetupComplete(false);
        setAccountStatus(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const availableEarnings = "$0.00";
  const inProgressCount = assignedJobs.length;
  const completionRate = assignedJobs.length + completedJobs.length > 0
    ? Math.round((completedJobs.length / (assignedJobs.length + completedJobs.length)) * 100)
    : 0;
  const onTimeRate = "—";
  const timeline = [
    ...invites.slice(0, 3).map((i) => ({
      id: `inv-${i.inviteId}`,
      message: `Invite received${i.jobTitle ? ` • ${i.jobTitle}` : ""}`,
      at: i.createdAt,
    })),
    ...assignedJobs.slice(0, 2).map((j) => ({
      id: `asg-${j.id}`,
      message: `Job active${j.title ? ` • ${j.title}` : ""}`,
      at: j.assignedAt,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">Contractor Dashboard</h1>
        <p className="mt-2 text-slate-600">Loading command center…</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-slate-50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contractor Command Center</h1>
          <p className="mt-1 text-slate-600">Track active work, earnings progress, and next actions.</p>
        </div>
        <details className="group relative">
          <summary className="cursor-pointer list-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            Quick Actions
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <Link href="/dashboard/contractor/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Update Availability</Link>
            <Link href="/dashboard/contractor/pm" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Submit P&M</Link>
            <Link href="/dashboard/contractor/messages" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">View Messages</Link>
            <Link href="/dashboard/contractor/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Update Profile</Link>
          </div>
        </details>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card title="Available Earnings" value={availableEarnings} subtitle="Funds ready to release" icon="💵" accent="from-emerald-50 to-white" />
        <Card title="In Progress Jobs" value={String(inProgressCount)} subtitle="Active assigned jobs" icon="🧰" accent="from-sky-50 to-white" />
        <div className={`rounded-2xl border p-4 shadow-sm ${pendingInviteCount > 0 ? "border-amber-300 bg-gradient-to-br from-amber-100 to-white" : "border-slate-200 bg-gradient-to-br from-amber-50 to-white"}`}>
          <p className="text-sm font-medium text-slate-700">
            📨 Pending Invites
            {pendingInviteCount > 0 ? <span className="ml-2 inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500 align-middle" /> : null}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{String(pendingInviteCount)}</p>
          <p className="mt-1 text-xs text-slate-600">
            {pendingInviteCount > 0
              ? `You have ${pendingInviteCount} job invitation(s) waiting.`
              : "Awaiting your response"}
          </p>
          {pendingInviteCount > 0 ? (
            <Link href="/dashboard/contractor/invites" className="mt-2 inline-block text-sm font-medium text-amber-700 hover:text-amber-800">
              View Invites →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Your Active Jobs</h2>
            <Link href="/dashboard/contractor/jobs" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">View All</Link>
          </div>
          {assignedJobs.length === 0 ? (
            <p className="mt-4 text-slate-500">You’re all clear. New job invites will appear here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {assignedJobs.slice(0, 6).map((job) => (
                <article key={job.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-emerald-200 hover:shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{job.title ?? "Untitled Job"}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {job.region?.split(",")[0] || "Location pending"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">Scheduled: {formatDate(job.assignedAt)}</p>
                      <p className="mt-1 text-sm text-slate-500">Job Value: To be confirmed</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadgeClasses(job.status)}`}>
                      {normalizeStatusLabel(job.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/dashboard/contractor/jobs/${job.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">🔵 View Details</Link>
                    <Link href={`/dashboard/contractor/messages?jobId=${job.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">💬 Message</Link>
                    <Link href={`/dashboard/contractor/pm?job=${job.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">📄 Submit P&amp;M</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Performance Snapshot</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Metric label="⭐ Rating" value="Coming soon" />
            <Metric label="🕒 On-Time Rate" value={onTimeRate} />
            <Metric label="🛠 Completion Rate" value={`${completionRate}%`} />
            <Metric
              label="🚫 Strike Count"
              value={String(accountStatus?.strikeCount ?? 0)}
              tone={(accountStatus?.strikeCount ?? 0) > 0 ? "warning" : "neutral"}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Account Health &amp; Payment Setup</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className={paymentSetupComplete ? "text-emerald-700" : "text-amber-700"}>
              {paymentSetupComplete ? "🟢 Payment Setup: Verified" : "🟡 Payment Setup: Pending"}
            </p>
            {accountStatus?.activeSuspension ? (
              <p className="text-rose-700">
                🔴 Action Required: Suspended until {formatDate(accountStatus.activeSuspension.suspendedUntil)}
              </p>
            ) : null}
            {!paymentSetupComplete ? (
              <Link href="/dashboard/contractor/payment" className="inline-block rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700">
                Complete Payment Setup
              </Link>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Activity Timeline</h2>
          {timeline.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No recent activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {timeline.map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-800">{event.message}</div>
                  <div className="text-xs text-slate-500">{formatDateTime(event.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Card(props: { title: string; value: string; subtitle: string; icon: string; accent: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${props.accent} p-4 shadow-sm`}>
      <p className="text-sm font-medium text-slate-600">{props.icon} {props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.subtitle}</p>
    </div>
  );
}

function Metric(props: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <div className={`rounded-xl border p-3 ${props.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-slate-600">{props.label}</div>
      <div className="mt-1 font-semibold text-slate-900">{props.value}</div>
    </div>
  );
}
