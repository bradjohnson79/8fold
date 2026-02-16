import React from "react";
import { Link } from "expo-router";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../../src/auth/session";
import {
  Card,
  Colors,
  EmptyState,
  ErrorBanner,
  StatusBadge,
  getJobStatusDisplay,
  normalizeUserSafeError,
  PrimaryButtonSurface,
  JobHero
} from "../../../components/ui";

type JobFeedItem = {
  id: string;
  title: string;
  scope: string;
  region: string;
  serviceType: string;
  timeWindow: string | null;
  routerEarningsCents: number;
  publishedAt: string;
};

type JobStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "CONTRACTOR_COMPLETED"
  | "CUSTOMER_APPROVED"
  | "CUSTOMER_REJECTED"
  | "COMPLETION_FLAGGED"
  | "COMPLETED_APPROVED";

type JobDetail = {
  id: string;
  status: JobStatus;
  title: string;
  scope: string;
  region: string;
  serviceType: string;
  timeWindow: string | null;
  routerEarningsCents: number;
  brokerFeeCents: number;
  contractorPayoutCents: number;
  photos?: { id: string; url: string | null }[];
};

type JobCardData = {
  id: string;
  status: JobStatus;
  title: string;
  region: string;
  serviceType: string;
  timeWindow: string | null;
  scope?: string;
  routerEarningsCents: number;
  brokerFeeCents: number;
  contractorPayoutCents: number;
  photoUrl?: string | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function apiFetch<T>(baseUrl: string, token: string | null, path: string) {
  const resp = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = typeof json?.error === "string" ? json.error : "Request failed";
    throw new Error(msg);
  }
  return json as T;
}

function JobCardSkeleton() {
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
      <View style={{ height: 180, backgroundColor: "rgba(15,23,42,0.06)" }} />
      <View style={{ padding: 16 }}>
        <View style={{ height: 18, width: "60%", borderRadius: 10, backgroundColor: "rgba(15,23,42,0.08)" }} />
        <View style={{ marginTop: 10, height: 12, width: "40%", borderRadius: 10, backgroundColor: "rgba(15,23,42,0.06)" }} />
        <View style={{ marginTop: 16, height: 90, borderRadius: 14, backgroundColor: "rgba(15,23,42,0.05)" }} />
        <View style={{ marginTop: 14, height: 48, borderRadius: 16, backgroundColor: "rgba(22,163,74,0.25)" }} />
      </View>
    </Card>
  );
}

function PayoutRow({
  label,
  value,
  emphasize
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: emphasize ? "rgba(22,163,74,0.10)" : "transparent"
      }}
    >
      <Text style={{ color: emphasize ? Colors.green : Colors.muted, fontWeight: emphasize ? "900" : "700" }}>
        {label}
      </Text>
      <Text style={{ color: emphasize ? Colors.green : Colors.text, fontWeight: "900" }}>
        {value}
      </Text>
    </View>
  );
}

function JobCard({ job }: { job: JobCardData }) {
  const customerPaysCents = job.contractorPayoutCents + job.routerEarningsCents + job.brokerFeeCents;

  return (
    <Card style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
      {job.photoUrl ? (
        <Image
          source={{ uri: job.photoUrl }}
          style={{ width: "100%", height: 200 }}
          resizeMode="cover"
        />
      ) : (
        <JobHero serviceType={job.serviceType} height={200} />
      )}

      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontSize: 20, fontWeight: "900" }}>
              {job.title}
            </Text>
            <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
              {job.region}
              {job.timeWindow ? ` · ${job.timeWindow}` : ""}
            </Text>
          </View>
          <StatusBadge {...getJobStatusDisplay(job.status)} />
        </View>

        {/* Payment Breakdown */}
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.10)",
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            overflow: "hidden"
          }}
        >
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(15,23,42,0.06)" }}>
            <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 14 }}>
              Payment Breakdown
            </Text>
          </View>
          <View style={{ padding: 10 }}>
            <PayoutRow label="Customer Pays" value={money(customerPaysCents)} />
            <PayoutRow label="Contractor Cost" value={money(job.contractorPayoutCents)} />
            <PayoutRow label="Your Earnings" value={money(job.routerEarningsCents)} emphasize />
            <PayoutRow label="8Fold Local Fee" value={money(job.brokerFeeCents)} />
          </View>
        </View>

        {/* Job Details (bullets, not paragraphs) */}
        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.10)",
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            padding: 12
          }}
        >
          <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 14 }}>
            Job Details
          </Text>
          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: Colors.muted, fontSize: 13, lineHeight: 18 }}>• Assign to a vetted contractor</Text>
            <Text style={{ color: Colors.muted, fontSize: 13, lineHeight: 18 }}>• Fixed payout — no negotiation</Text>
            <Text style={{ color: Colors.muted, fontSize: 13, lineHeight: 18 }}>• You earn after completion approval</Text>
          </View>
        </View>

        <Link href={`/jobs/${job.id}`} asChild>
          <Pressable style={{ marginTop: 14 }} accessibilityRole="button">
            <PrimaryButtonSurface label="Claim & Route This Job" />
          </Pressable>
        </Link>
      </View>
    </Card>
  );
}

export default function JobsFeedScreen() {
  const { sessionToken } = useSession();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_ORIGIN;

  const [items, setItems] = React.useState<JobCardData[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function refresh() {
    if (!apiBaseUrl) {
      setError("Missing EXPO_PUBLIC_API_ORIGIN");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const feed = await apiFetch<{ jobs: JobFeedItem[] }>(apiBaseUrl, sessionToken, "/api/jobs/feed");

      // Pull job details for each card so we can render the full reference-style breakdown
      const detailResults = await Promise.allSettled(
        (feed.jobs ?? []).map((j) =>
          apiFetch<{ job: JobDetail }>(apiBaseUrl, sessionToken, `/api/jobs/${j.id}`)
        )
      );

      const cards: JobCardData[] = (feed.jobs ?? []).map((base, idx) => {
        const r = detailResults[idx];
        if (r && r.status === "fulfilled") {
          const d = r.value.job;
          const photoUrl = d.photos?.find((p) => typeof p.url === "string" && p.url)?.url ?? null;
          return {
            id: d.id,
            status: d.status,
            title: d.title,
            region: d.region,
            serviceType: d.serviceType,
            timeWindow: d.timeWindow,
            scope: d.scope,
            routerEarningsCents: d.routerEarningsCents,
            brokerFeeCents: d.brokerFeeCents,
            contractorPayoutCents: d.contractorPayoutCents,
            photoUrl
          };
        }

        // Fallback (should be rare): render a simplified card from feed data
        return {
          id: base.id,
          status: "PUBLISHED",
          title: base.title,
          region: base.region,
          serviceType: base.serviceType,
          timeWindow: base.timeWindow,
          scope: base.scope,
          routerEarningsCents: base.routerEarningsCents,
          brokerFeeCents: 0,
          contractorPayoutCents: 0,
          photoUrl: null
        };
      });

      setItems(cards);
      setHasLoadedOnce(true);
    } catch (e) {
      setError(normalizeUserSafeError(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topEarningsCents =
    items.reduce((max, j) => Math.max(max, j.routerEarningsCents ?? 0), 0) ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        <View style={{ padding: 16 }}>
          {/* Branded header (reference-like) */}
          <View
            style={{
              backgroundColor: "#0B1F3A",
              borderRadius: 18,
              padding: 16
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>
                8Fold Local
              </Text>
              <View
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: "rgba(255,255,255,0.10)",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.18)"
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                  {topEarningsCents > 0 ? money(topEarningsCents) : "Earn $"}
                </Text>
              </View>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 10, fontSize: 13, lineHeight: 18 }}>
              Available work, vetted contractors, and clear earnings shown upfront.
            </Text>
          </View>

          {/* Errors should be inline & non-dominant */}
          {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}

          {/* Loading skeletons (no blocking spinners) */}
          {loading && !hasLoadedOnce ? (
            <>
              <JobCardSkeleton />
              <JobCardSkeleton />
              <JobCardSkeleton />
            </>
          ) : null}

          {/* Empty state */}
          {!loading && hasLoadedOnce && items.length === 0 ? (
            <EmptyState
              title="No available work right now"
              body="New jobs appear here as soon as they’re reviewed and published. Pull down to refresh."
              actionLabel="Refresh"
              onAction={() => void refresh()}
            />
          ) : null}

          {/* Cards */}
          {items.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

