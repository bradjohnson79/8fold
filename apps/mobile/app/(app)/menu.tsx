import React from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Colors, PrimaryButton, SecondaryButton } from "../../components/ui";
import { useSession } from "../../src/auth/session";

async function apiPost<T>(baseUrl: string, token: string | null, path: string, body: any) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
  return json as T;
}

export default function MenuScreen() {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_ORIGIN;
  const { isLoaded, sessionToken, setSessionToken, clearSession } = useSession();

  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function requestCode() {
    if (!apiBaseUrl) {
      setError("Missing EXPO_PUBLIC_API_ORIGIN");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await apiPost<{ ok: true; debugCode?: string }>(
        apiBaseUrl,
        null,
        "/api/auth/request",
        { email }
      );
      setStep("code");
      setNotice("Check your email for your one-time code.");
      if (r.debugCode) setNotice(`DEV CODE: ${r.debugCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!apiBaseUrl) {
      setError("Missing EXPO_PUBLIC_API_ORIGIN");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await apiPost<{ ok: true; sessionToken: string }>(
        apiBaseUrl,
        null,
        "/api/auth/verify",
        { token: code }
      );
      await setSessionToken(r.sessionToken);
      setNotice("Signed in.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!apiBaseUrl) {
      await clearSession();
      return;
    }
    try {
      if (sessionToken) {
        await apiPost(apiBaseUrl, sessionToken, "/api/auth/logout", {});
      }
    } finally {
      await clearSession();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 20 }}>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: "900" }}>Menu</Text>
          <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
            Browse jobs as a guest. Sign in only when you’re ready to route, message, approve, or manage payouts.
          </Text>

          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700" }}>
              Session
            </Text>
            <Text style={{ color: Colors.text, marginTop: 8, fontSize: 14 }}>
              {isLoaded ? (sessionToken ? "Signed in" : "Guest mode") : "Loading…"}
            </Text>
            {sessionToken ? (
              <View style={{ marginTop: 12 }}>
                <SecondaryButton label="Sign out" onPress={() => void signOut()} />
              </View>
            ) : (
              <>
                {step === "email" ? (
                  <>
                    <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>
                      Email
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={email}
                      placeholder="you@example.com"
                      placeholderTextColor="rgba(15,23,42,0.35)"
                      onChangeText={setEmail}
                      style={{
                        marginTop: 8,
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: 12,
                        padding: 12,
                        color: Colors.text,
                        backgroundColor: "#FFFFFF"
                      }}
                    />
                    <View style={{ marginTop: 12 }}>
                      <PrimaryButton
                        label={busy ? "Sending…" : "Send code"}
                        onPress={() => void requestCode()}
                        disabled={busy || !email.trim()}
                        loading={busy}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>
                      One-time code
                    </Text>
                    <TextInput
                      value={code}
                      placeholder="123456"
                      placeholderTextColor="rgba(15,23,42,0.35)"
                      onChangeText={setCode}
                      style={{
                        marginTop: 8,
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: 12,
                        padding: 12,
                        color: Colors.text,
                        backgroundColor: "#FFFFFF"
                      }}
                    />
                    <View style={{ marginTop: 12, gap: 10 }}>
                      <PrimaryButton
                        label={busy ? "Verifying…" : "Verify & sign in"}
                        onPress={() => void verify()}
                        disabled={busy || !code.trim()}
                        loading={busy}
                      />
                      <SecondaryButton label="Back" onPress={() => setStep("email")} disabled={busy} />
                    </View>
                  </>
                )}
              </>
            )}

            {notice ? <Text style={{ color: Colors.muted, marginTop: 10, fontSize: 13 }}>{notice}</Text> : null}
            {error ? <Text style={{ color: Colors.danger, marginTop: 10, fontSize: 13 }}>{error}</Text> : null}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

