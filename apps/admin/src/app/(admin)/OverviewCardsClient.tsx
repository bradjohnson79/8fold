"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./overview.module.css";

export type RevenueRangeKey = "24h" | "7d" | "30d" | "60d" | "90d";

export type OverviewCardsPayload = {
  filters: {
    selected: {
      latestJobsRegion: string;
      overdueRoutingRegion: string;
      newestJobPostersRegion: string;
      newestContractorsRegion: string;
      newestRoutersRegion: string;
      payoutsPendingRegion: string;
      payoutsPaidRegion: string;
      contractorRevenueRange: RevenueRangeKey;
      routerRevenueRange: RevenueRangeKey;
      platformRevenueRange: RevenueRangeKey;
    };
    regionOptions: string[];
  };
  latestJobs: Array<{ jobId: string; city: string | null; regionCode: string | null; status: string; postedAt: string | null }>;
  overdueRouting: Array<{ jobId: string; city: string | null; regionCode: string | null; postedAt: string | null; assignedRouterName: string | null }>;
  openSupportMessages: Array<{ ticketId: string; category: string; userRole: string; createdAt: string; status: string }>;
  openDisputes: Array<{ disputeId: string; jobId: string; userRole: string; createdAt: string; status: string }>;
  newestJobPosters: Array<{ userId: string; name: string | null; city: string | null; regionCode: string | null; joinedAt: string }>;
  newestContractors: Array<{ userId: string; name: string | null; trade: string | null; city: string | null; regionCode: string | null; joinedAt: string }>;
  newestRouters: Array<{ userId: string; name: string | null; region: string | null; joinedAt: string }>;
  payoutsPending: Array<{ jobId: string; contractor: string | null; amountCents: number; inProgressSince: string | null }>;
  payoutsPaid: Array<{ jobId: string; contractor: string | null; amountCents: number; paidAt: string | null }>;
  revenue: {
    contractor: { totalCents: number; jobsCount: number };
    router: { totalCents: number; jobsCount: number };
    platform: {
      totalCents: number;
      jobsCount: number;
      topJobs: Array<{ jobId: string; city: string | null; regionCode: string | null; amountCents: number; paidAt: string | null }>;
    };
  };
};

function toMoney(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function toStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function toSince(value: string | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "—";
  const deltaMs = Date.now() - then;
  if (deltaMs <= 0) return "0h";
  const hours = Math.floor(deltaMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

function locationLabel(city: string | null, region: string | null): string {
  const parts = [city, region].filter((x) => Boolean(String(x ?? "").trim()));
  return parts.length ? parts.join(", ") : "—";
}

export default function OverviewCardsClient({ payload }: { payload: OverviewCardsPayload | null }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  if (!payload) {
    return (
      <div style={{ marginTop: 18, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
        Failed to load overview cards.
      </div>
    );
  }

  const selected = payload.filters.selected;
  const regionOptions = payload.filters.regionOptions ?? ["ALL"];

  function updateParam(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <>
      <div className={styles.grid2}>
        <section className={styles.card}>
          <CardHeader
            title="Latest Jobs"
            expandHref={`/jobs?sort=createdAt:desc${selected.latestJobsRegion !== "ALL" ? `&q=${encodeURIComponent(selected.latestJobsRegion)}` : ""}`}
            control={
              <select
                className={styles.select}
                value={selected.latestJobsRegion}
                onChange={(e) => updateParam("latestJobsRegion", e.target.value, "ALL")}
                aria-label="Latest jobs region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.latestJobs.length === 0 ? <Empty /> : null}
            {payload.latestJobs.map((row) => (
              <div key={row.jobId} className={styles.row}>
                <div className={styles.rowMain}>{row.jobId}</div>
                <div className={styles.rowMeta}>{locationLabel(row.city, row.regionCode)}</div>
                <div className={styles.rowMeta}>
                  {row.status} · Posted {toStamp(row.postedAt)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="OD Routing >24 Hours"
            expandHref={`/jobs?status=CUSTOMER_APPROVED_AWAITING_ROUTER&showArchived=0${selected.overdueRoutingRegion !== "ALL" ? `&q=${encodeURIComponent(selected.overdueRoutingRegion)}` : ""}`}
            control={
              <select
                className={styles.select}
                value={selected.overdueRoutingRegion}
                onChange={(e) => updateParam("overdueRoutingRegion", e.target.value, "ALL")}
                aria-label="Overdue routing region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.overdueRouting.length === 0 ? <Empty /> : null}
            {payload.overdueRouting.map((row) => (
              <div key={row.jobId} className={styles.row}>
                <div className={styles.rowMain}>{row.jobId}</div>
                <div className={styles.rowMeta}>{locationLabel(row.city, row.regionCode)}</div>
                <div className={styles.rowMeta}>Posted {toSince(row.postedAt)} ago</div>
                <div className={styles.rowMeta}>Router: {row.assignedRouterName || "Unassigned"}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <CardHeader title="Open Support Messages" expandHref="/support" />
          <div className={styles.list}>
            {payload.openSupportMessages.length === 0 ? <Empty /> : null}
            {payload.openSupportMessages.map((row) => (
              <div key={row.ticketId} className={styles.row}>
                <div className={styles.rowMain}>{row.ticketId}</div>
                <div className={styles.rowMeta}>
                  {row.category} · {row.userRole}
                </div>
                <div className={styles.rowMeta}>
                  {toStamp(row.createdAt)} · {row.status}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader title="Open Disputes" expandHref="/disputes" />
          <div className={styles.list}>
            {payload.openDisputes.length === 0 ? <Empty /> : null}
            {payload.openDisputes.map((row) => (
              <div key={row.disputeId} className={styles.row}>
                <div className={styles.rowMain}>{row.disputeId}</div>
                <div className={styles.rowMeta}>
                  Job {row.jobId} · {row.userRole}
                </div>
                <div className={styles.rowMeta}>
                  {toStamp(row.createdAt)} · {row.status}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.grid3}>
        <section className={styles.card}>
          <CardHeader
            title="Newest Job Posters"
            expandHref={`/job-posters${selected.newestJobPostersRegion !== "ALL" ? `?q=${encodeURIComponent(selected.newestJobPostersRegion)}` : ""}`}
            control={
              <select
                className={styles.select}
                value={selected.newestJobPostersRegion}
                onChange={(e) => updateParam("newestJobPostersRegion", e.target.value, "ALL")}
                aria-label="Newest job posters region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.newestJobPosters.length === 0 ? <Empty /> : null}
            {payload.newestJobPosters.map((row) => (
              <div key={row.userId} className={styles.row}>
                <div className={styles.rowMain}>{row.name || row.userId}</div>
                <div className={styles.rowMeta}>{locationLabel(row.city, row.regionCode)}</div>
                <div className={styles.rowMeta}>Joined {toStamp(row.joinedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="Newest Contractors"
            expandHref={`/contractors${selected.newestContractorsRegion !== "ALL" ? `?q=${encodeURIComponent(selected.newestContractorsRegion)}` : ""}`}
            control={
              <select
                className={styles.select}
                value={selected.newestContractorsRegion}
                onChange={(e) => updateParam("newestContractorsRegion", e.target.value, "ALL")}
                aria-label="Newest contractors region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.newestContractors.length === 0 ? <Empty /> : null}
            {payload.newestContractors.map((row) => (
              <div key={row.userId} className={styles.row}>
                <div className={styles.rowMain}>{row.name || row.userId}</div>
                <div className={styles.rowMeta}>
                  {row.trade || "—"} · {locationLabel(row.city, row.regionCode)}
                </div>
                <div className={styles.rowMeta}>Joined {toStamp(row.joinedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="Newest Routers"
            expandHref={`/routers${selected.newestRoutersRegion !== "ALL" ? `?q=${encodeURIComponent(selected.newestRoutersRegion)}` : ""}`}
            control={
              <select
                className={styles.select}
                value={selected.newestRoutersRegion}
                onChange={(e) => updateParam("newestRoutersRegion", e.target.value, "ALL")}
                aria-label="Newest routers region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.newestRouters.length === 0 ? <Empty /> : null}
            {payload.newestRouters.map((row) => (
              <div key={row.userId} className={styles.row}>
                <div className={styles.rowMain}>{row.name || row.userId}</div>
                <div className={styles.rowMeta}>Region {row.region || "—"}</div>
                <div className={styles.rowMeta}>Joined {toStamp(row.joinedAt)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <CardHeader
            title="Payouts Pending"
            expandHref="/payouts?status=REQUESTED"
            control={
              <select
                className={styles.select}
                value={selected.payoutsPendingRegion}
                onChange={(e) => updateParam("payoutsPendingRegion", e.target.value, "ALL")}
                aria-label="Pending payouts region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.payoutsPending.length === 0 ? <Empty /> : null}
            {payload.payoutsPending.map((row) => (
              <div key={row.jobId} className={styles.row}>
                <div className={styles.rowMain}>{row.jobId}</div>
                <div className={styles.rowMeta}>
                  {row.contractor || "—"} · {toMoney(row.amountCents)}
                </div>
                <div className={styles.rowMeta}>In progress since {toStamp(row.inProgressSince)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="Payouts Paid"
            expandHref="/payouts?status=PAID"
            control={
              <select
                className={styles.select}
                value={selected.payoutsPaidRegion}
                onChange={(e) => updateParam("payoutsPaidRegion", e.target.value, "ALL")}
                aria-label="Paid payouts region"
              >
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            }
          />
          <div className={styles.list}>
            {payload.payoutsPaid.length === 0 ? <Empty /> : null}
            {payload.payoutsPaid.map((row) => (
              <div key={row.jobId} className={styles.row}>
                <div className={styles.rowMain}>{row.jobId}</div>
                <div className={styles.rowMeta}>
                  {row.contractor || "—"} · {toMoney(row.amountCents)}
                </div>
                <div className={styles.rowMeta}>Paid {toStamp(row.paidAt)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.grid3}>
        <section className={styles.card}>
          <CardHeader
            title="Contractor $$$"
            control={
              <RangeSelect
                value={selected.contractorRevenueRange}
                onChange={(v) => updateParam("contractorRevenueRange", v, "30d")}
                ariaLabel="Contractor revenue range"
              />
            }
          />
          <div className={styles.summary}>
            <div className={styles.summaryValue}>{toMoney(payload.revenue.contractor.totalCents)}</div>
            <div className={styles.rowMeta}>Jobs: {payload.revenue.contractor.jobsCount}</div>
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="Router $$$"
            control={
              <RangeSelect
                value={selected.routerRevenueRange}
                onChange={(v) => updateParam("routerRevenueRange", v, "30d")}
                ariaLabel="Router revenue range"
              />
            }
          />
          <div className={styles.summary}>
            <div className={styles.summaryValue}>{toMoney(payload.revenue.router.totalCents)}</div>
            <div className={styles.rowMeta}>Routed jobs: {payload.revenue.router.jobsCount}</div>
          </div>
        </section>

        <section className={styles.card}>
          <CardHeader
            title="Platform $$$"
            control={
              <RangeSelect
                value={selected.platformRevenueRange}
                onChange={(v) => updateParam("platformRevenueRange", v, "30d")}
                ariaLabel="Platform revenue range"
              />
            }
          />
          <div className={styles.summary}>
            <div className={styles.summaryValue}>{toMoney(payload.revenue.platform.totalCents)}</div>
            <div className={styles.rowMeta}>Jobs: {payload.revenue.platform.jobsCount}</div>
          </div>
          <div className={styles.subTitle}>Top 15 Highest Revenue Jobs</div>
          <div className={styles.list}>
            {payload.revenue.platform.topJobs.length === 0 ? <Empty /> : null}
            {payload.revenue.platform.topJobs.map((row) => (
              <div key={row.jobId} className={styles.row}>
                <div className={styles.rowMain}>
                  {row.jobId} · {toMoney(row.amountCents)}
                </div>
                <div className={styles.rowMeta}>{locationLabel(row.city, row.regionCode)}</div>
                <div className={styles.rowMeta}>Paid {toStamp(row.paidAt)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function CardHeader({
  title,
  control,
  expandHref,
}: {
  title: string;
  control?: React.ReactNode;
  expandHref?: string;
}) {
  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardHeaderRight}>
        {control ?? null}
        {expandHref ? (
          <Link href={expandHref} className={styles.expandLink}>
            Expand
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function RangeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: RevenueRangeKey;
  onChange: (value: RevenueRangeKey) => void;
  ariaLabel: string;
}) {
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value as RevenueRangeKey)}
      aria-label={ariaLabel}
    >
      <option value="24h">24 hours</option>
      <option value="7d">7 days</option>
      <option value="30d">30 days</option>
      <option value="60d">60 days</option>
      <option value="90d">90 days</option>
    </select>
  );
}

function Empty() {
  return <div className={styles.empty}>No data found.</div>;
}
