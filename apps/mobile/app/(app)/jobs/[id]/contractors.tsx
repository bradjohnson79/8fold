import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../../../src/auth/session";
import { BackButton } from "../../../../components/BackButton";
import { Card, Colors, ErrorBanner, PrimaryButton, SkeletonCard, normalizeUserSafeError } from "../../../../components/ui";

type EligibleContractor = {
  id: string;
  businessName: string;
  trade: string;
  distanceKm: number | null;
  reliability: "GOOD" | "WATCH" | "NEW";
  fixedPayoutCents: number;
  availability: "AVAILABLE" | "BUSY";
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function apiFetch<T>(baseUrl: string, token: string | null, path: string, init?: RequestInit) {
  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
  return json as T;
}

export default function ContractorSelectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionToken } = useSession();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_ORIGIN;

  const [items, setItems] = React.useState<EligibleContractor[]>([]);
  const [limitKm, setLimitKm] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);

  async function load() {
    if (!apiBaseUrl) {
      setError("Missing EXPO_PUBLIC_API_ORIGIN");
      return;
    }
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ contractors: EligibleContractor[]; limitKm: number }>(
        apiBaseUrl,
        sessionToken,
        `/api/jobs/${id}/contractors/eligible`
      );
      setItems(data.contractors);
      setLimitKm(data.limitKm);
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

  async function sendJob(contractorId: string) {
    if (!apiBaseUrl || !id) return;
    setSubmittingId(contractorId);
    setError("");
    try {
      const res = await apiFetch<{ ok: true; dispatchId: string; token?: string }>(
        apiBaseUrl,
        sessionToken,
        `/api/jobs/${id}/contractors/dispatch`,
        { method: "POST", body: JSON.stringify({ contractorId }) }
      );
      const msg = res.token
        ? `DEV contractor decision token:\n${res.token}\n\n(Contractor can POST it to /api/contractor/dispatch/respond)`
        : "Sent. Contractor can accept or decline.";
      Alert.alert("Job sent", msg, [{ text: "OK", onPress: () => router.replace("/jobs") }]);
    } catch (e) {
      setError(normalizeUserSafeError(e));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ padding: 20 }}>
          <BackButton fallbackHref={`/jobs/${id ?? ""}`} />
          <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 10 }}>
            Select contractor
          </Text>
          <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
            Showing eligible contractors only. Must match trade, same state/province, APPROVED, and within {limitKm} km.
          </Text>

          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : null}

          {!loading && items.length === 0 ? (
            <Card style={{ marginTop: 14 }}>
              <Text style={{ color: Colors.text, fontWeight: "800" }}>No eligible contractors</Text>
              <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14 }}>
                Try again later or adjust contractor coverage in Ops.
              </Text>
            </Card>
          ) : null}

          {items.map((c) => (
            <Card key={c.id} style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "900" }}>{c.businessName}</Text>
              <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13 }}>
                {c.trade} · {c.distanceKm == null ? "Distance unknown" : `${c.distanceKm.toFixed(1)} km`} ·{" "}
                {c.reliability} ·{" "}
                <Text style={{ color: c.availability === "AVAILABLE" ? Colors.green : Colors.orange, fontWeight: "900" }}>
                  {c.availability}
                </Text>
              </Text>
              <Text style={{ color: Colors.text, marginTop: 10, fontSize: 14 }}>
                Fixed payout: <Text style={{ fontWeight: "900" }}>{money(c.fixedPayoutCents)}</Text>
              </Text>
              <View style={{ marginTop: 12 }}>
                <PrimaryButton
                  label={submittingId === c.id ? "Sending…" : "Send Job"}
                  onPress={() => void sendJob(c.id)}
                  loading={submittingId === c.id}
                  disabled={!!submittingId}
                />
              </View>
              <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 12 }}>
                Routers cannot edit price, message contractors, or negotiate terms.
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

