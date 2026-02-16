import { useAuth, useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { Text, TextInput, View, ScrollView, Pressable } from "react-native";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Colors, PrimaryButton, SecondaryButtonSurface } from "../../components/ui";
import { beacon } from "../../src/auth/runtimeSentinels";

function toUserFacingClerkError(err: unknown): string {
  const raw = err as any;
  const first = raw?.errors?.[0];
  return (
    (first?.longMessage as string | undefined) ||
    (first?.message as string | undefined) ||
    "Couldn’t sign in. Please try again."
  );
}

export default function Page() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isSignedIn) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setError("");
    setSubmitting(true);
    beacon("auth_action", { surface: "sign_in", action: "submit" });

    try {
      const signInAttempt = await signIn.create({
        identifier,
        password
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        beacon("auth_action", { surface: "sign_in", action: "complete" });
        router.replace("/");
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err) {
      const raw = err as any;
      const first = raw?.errors?.[0];
      if (first?.code === "session_exists") {
        setError("You’re already signed in. Returning to the app…");
        beacon("auth_action", { surface: "sign_in", action: "session_exists" });
        router.replace("/");
        return;
      }
      beacon("auth_action", { surface: "sign_in", action: "error", code: first?.code });
      setError(toUserFacingClerkError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 20 }}>
          <Text style={{ color: Colors.text, fontSize: 28, fontWeight: "900" }}>Sign in</Text>
          <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
            Route approved jobs. Earn a coordination fee when the job completes. Manual
            oversight. No guaranteed income.
          </Text>

          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700" }}>
              Email or username
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={identifier}
              placeholder="bradjohnson79"
              placeholderTextColor="rgba(15,23,42,0.35)"
              onChangeText={(text) => setIdentifier(text)}
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

            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>
              Password
            </Text>
            <TextInput
              value={password}
              placeholder="Password"
              placeholderTextColor="rgba(15,23,42,0.35)"
              secureTextEntry={true}
              onChangeText={(p) => setPassword(p)}
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

            {error ? (
              <Text style={{ color: Colors.danger, marginTop: 10, fontSize: 13 }}>
                {error}
              </Text>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                label={submitting ? "Signing in…" : "Continue"}
                onPress={() => void onSignInPress()}
                disabled={!isLoaded || submitting}
                loading={submitting}
              />
            </View>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Text style={{ color: Colors.muted }}>New here?</Text>
              <Link href="/sign-up" asChild>
                <Pressable accessibilityRole="button" hitSlop={10}>
                  <SecondaryButtonSurface label="Sign up" />
                </Pressable>
              </Link>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

