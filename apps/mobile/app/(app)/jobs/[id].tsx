import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  Image,
  Pressable,
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
  PrimaryButton,
  SkeletonCard,
  StatusBadge,
  getJobStatusDisplay,
  normalizeUserSafeError,
  JobHero
} from "../../../components/ui";
import { BackButton } from "../../../components/BackButton";

type JobDetail = {
  id: string;
  status:
    | "DRAFT"
    | "PUBLISHED"
    | "ASSIGNED"
    | "IN_PROGRESS"
    | "CONTRACTOR_COMPLETED"
    | "CUSTOMER_APPROVED"
    | "CUSTOMER_REJECTED"
    | "COMPLETION_FLAGGED"
    | "COMPLETED_APPROVED";
  title: string;
  scope: string;
  region: string;
  serviceType: string;
  timeWindow: string | null;
  routerEarningsCents: number;
  brokerFeeCents: number;
  contractorPayoutCents: number;
  laborTotalCents?: number;
  materialsTotalCents?: number;
  transactionFeeCents?: number;
  jobType: "urban" | "regional";
  publishedAt: string;
  claimedAt: string | null;
  routedAt: string | null;
  photos: { id: string; kind: string; url: string | null; storageKey: string | null }[];
};

type Actions = {
  isClaimedByYou: boolean;
  canClaim: boolean;
  canRouteConfirm: boolean;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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

async function apiFetch<T>(
  baseUrl: string,
  token: string | null,
  path: string,
  init?: RequestInit
) {
  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = typeof json?.error === "string" ? json.error : "Request failed";
    throw new Error(msg);
  }
  return json as T;
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionToken } = useSession();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_ORIGIN;

  const [job, setJob] = React.useState<JobDetail | null>(null);
  const [actions, setActions] = React.useState<Actions | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function load() {
    if (!apiBaseUrl) {
      setError(normalizeUserSafeError(new Error("Missing EXPO_PUBLIC_API_ORIGIN")));
      return;
    }
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ job: JobDetail; actions: Actions }>(
        apiBaseUrl,
        sessionToken,
        `/api/jobs/${id}`
      );
      setJob(data.job);
      setActions(data.actions);
    } catch (e) {
      setError(normalizeUserSafeError(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function claim() {
    if (!apiBaseUrl || !id) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch(apiBaseUrl, sessionToken, `/api/jobs/${id}/claim`, { method: "POST" });
      await load();
      Alert.alert("Job locked to you", "Next: confirm routing.");
    } catch (e) {
      setError(normalizeUserSafeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function routeConfirmAndPickContractor() {
    if (!apiBaseUrl || !id) return;
    Alert.alert(
      "Confirm routing responsibility",
      "You are accepting responsibility to route this job to an eligible contractor. Pricing is locked. No bidding or negotiation.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            setLoading(true);
            setError("");
            try {
              await apiFetch(apiBaseUrl, sessionToken, `/api/jobs/${id}/route-confirm`, {
                method: "POST"
              });
              await load();
              router.push(`/jobs/${id}/contractors`);
            } catch (e) {
              setError(normalizeUserSafeError(e));
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }

  const totalJobPosterPaysCents = job
    ? (job.laborTotalCents ?? 0) + (job.materialsTotalCents ?? 0)
    : 0;

  const photoUrl =
    job?.photos?.find((p) => typeof p.url === "string" && p.url)?.url ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ padding: 20 }}>
        <BackButton fallbackHref="/jobs" />

        {job ? null : (
          <Text style={{ color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 10 }}>
            {loading ? "Loading…" : "Job"}
          </Text>
        )}

        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

        {loading && !job ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard lines={2} />
          </>
        ) : null}

        {!loading && !job && !error ? (
          <EmptyState
            title="Job unavailable"
            body="This job may have been claimed or closed. You can return to the feed to view current jobs."
            actionLabel="Back to jobs"
            onAction={() => router.replace("/jobs")}
          />
        ) : null}

        {job ? (
          <Card style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
            ) : (
              <JobHero serviceType={job.serviceType} height={220} />
            )}

            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "900" }}>
                    {job.title}
                  </Text>
                  <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
                    {job.region}
                    {job.timeWindow ? ` · ${job.timeWindow}` : ""}
                  </Text>
                </View>
                <StatusBadge {...getJobStatusDisplay(job.status)} />
              </View>

              {/* Payment Breakdown (reference-style) */}
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
                  <PayoutRow label="Job Poster Pays (Total)" value={money(totalJobPosterPaysCents)} />
                  <View style={{ height: 1, backgroundColor: "rgba(15,23,42,0.06)", marginVertical: 4 }} />
                  
                  <View style={{ paddingHorizontal: 10, marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, color: Colors.muted, fontStyle: "italic" }}>
                      Labor Portion: {money(job.laborTotalCents ?? 0)} (Splits apply to this only)
                    </Text>
                  </View>

                  <PayoutRow label="Contractor (75.0% of labor)" value={money(job.contractorPayoutCents)} />
                  <PayoutRow label="Router (15.0% of labor)" value={money(job.routerEarningsCents)} emphasize />
                  <PayoutRow label="8Fold (10.0% of labor)" value={money(job.brokerFeeCents)} />
                  
                  {job.materialsTotalCents ? (
                    <>
                      <View style={{ height: 1, backgroundColor: "rgba(15,23,42,0.06)", marginVertical: 4 }} />
                      <PayoutRow label="Materials (100% → Contractor)" value={money(job.materialsTotalCents)} />
                    </>
                  ) : null}

                  {/* Transaction fees are absorbed by the platform; none are added to the poster invoice here. */}
                </View>
              </View>

              {/* Job Details (bullets; no big paragraphs) */}
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
                  <Text style={{ color: Colors.muted, fontSize: 13, lineHeight: 18 }}>• You approve completion to unlock earnings</Text>
                </View>
                <Text style={{ color: Colors.muted, marginTop: 10, fontSize: 12 }}>
                  Trade: {job.serviceType} · Photos: {job.photos?.length ?? 0}
                </Text>
              </View>

              <Text style={{ color: Colors.muted, marginTop: 10, fontSize: 12 }}>
                Contractors are paid the next business day after job completion.
              </Text>

              {actions?.canClaim ? (
                <View style={{ marginTop: 14 }}>
                  <PrimaryButton
                    label="Claim & Route This Job"
                    onPress={() => void claim()}
                    loading={loading}
                  />
                </View>
              ) : null}

              {actions?.canRouteConfirm ? (
                <View style={{ marginTop: 14 }}>
                  <PrimaryButton
                    label="Claim & Route This Job"
                    onPress={() => void routeConfirmAndPickContractor()}
                    loading={loading}
                  />
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

