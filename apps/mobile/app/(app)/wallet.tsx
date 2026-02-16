import React from "react";
import { Link } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Colors,
  EmptyState,
  ErrorBanner,
  PrimaryButton,
  SecondaryButtonSurface,
  SkeletonCard,
  normalizeUserSafeError
} from "../../components/ui";
import { BackButton } from "../../components/BackButton";
import { useSession } from "../../src/auth/session";

type Totals = {
  PENDING: number;
  AVAILABLE: number;
  PAID: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function apiFetch<T>(
  baseUrl: string,
  token: string | null,
  path: string
): Promise<T> {
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

export default function WalletScreen() {
  const { sessionToken } = useSession();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_ORIGIN;
  const [totals, setTotals] = React.useState<Totals | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function refresh() {
    if (!apiBaseUrl) {
      setError(normalizeUserSafeError(new Error("Missing EXPO_PUBLIC_API_ORIGIN")));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ totals: Totals }>(
        apiBaseUrl,
        sessionToken,
        "/api/wallet/summary"
      );
      setTotals(data.totals);
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

  async function requestWithdraw() {
    if (!apiBaseUrl) {
      setError(normalizeUserSafeError(new Error("Missing EXPO_PUBLIC_API_ORIGIN")));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await fetch(`${apiBaseUrl}/api/payout-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: JSON.stringify({})
      }).then(async (resp) => {
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = typeof json?.error === "string" ? json.error : "Request failed";
          throw new Error(msg);
        }
      });
      Alert.alert(
        "Withdraw requested",
        "Payouts are processed manually (v1). You’ll see it marked paid after it’s sent."
      );
    } catch (e) {
      setError(normalizeUserSafeError(e));
    } finally {
      setSubmitting(false);
      await refresh();
    }
  }

  const hasAnyBalance =
    (totals?.PENDING ?? 0) > 0 || (totals?.AVAILABLE ?? 0) > 0 || (totals?.PAID ?? 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={{ flex: 1, padding: 20 }}>
      <BackButton fallbackHref="/jobs" />

      <Text style={{ color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 10 }}>
        Wallet
      </Text>
      <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14 }}>
        Clear totals. Manual payouts (v1).
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => void refresh()} disabled={loading}>
          <SecondaryButtonSurface label="Refresh" />
        </Pressable>

        <Link href="/faq" asChild>
          <Pressable accessibilityRole="button" hitSlop={8}>
            <SecondaryButtonSurface label="Trust & FAQ" />
          </Pressable>
        </Link>
      </View>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton
          label="Request payout (manual)"
          onPress={() => void requestWithdraw()}
          disabled={(totals?.AVAILABLE ?? 0) <= 0}
          loading={submitting}
        />
        <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 13 }}>
          {((totals?.AVAILABLE ?? 0) <= 0)
            ? "No available balance yet."
            : "Requests are reviewed and processed manually (v1)."}
        </Text>
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}

      {loading && !totals ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : null}

      {!loading && totals && !hasAnyBalance ? (
        <EmptyState
          title="No wallet activity yet"
          body="When an approved job is completed, your earnings move into Available. You can request a manual payout from there."
        />
      ) : null}

      {totals ? (
        <>
          <Card style={{ marginTop: 14 }}>
            <Text style={{ color: Colors.muted, fontSize: 12 }}>Pending</Text>
            <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 6 }}>
              {money(totals.PENDING)}
            </Text>
            <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13 }}>
              Pending means approved earnings not yet released.
            </Text>
          </Card>
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.green, fontSize: 12, fontWeight: "900" }}>Available</Text>
            <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 6 }}>
              {money(totals.AVAILABLE)}
            </Text>
            <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13 }}>
              Available can be requested for payout (manual in v1).
            </Text>
          </Card>
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.muted, fontSize: 12 }}>Paid</Text>
            <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 6 }}>
              {money(totals.PAID)}
            </Text>
            <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13 }}>
              Paid is confirmed after ops marks the payout paid.
            </Text>
          </Card>
        </>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

