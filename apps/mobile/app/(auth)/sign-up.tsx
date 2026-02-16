import * as React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAuth, useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Colors,
  PrimaryButton,
  SecondaryButtonSurface
} from "../../components/ui";
import { beacon } from "../../src/auth/runtimeSentinels";

function toUserFacingClerkError(err: unknown): { code?: string; message: string } {
  const raw = err as any;
  const first = raw?.errors?.[0];
  const code = first?.code as string | undefined;
  const msg =
    (first?.longMessage as string | undefined) ||
    (first?.message as string | undefined) ||
    "Something didn’t work. Please try again.";
  return { code, message: msg };
}

function nonEmpty(s: string) {
  return s.trim().length > 0;
}

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const auth = useAuth();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  React.useEffect(() => {
    if (!auth.isLoaded) return;
    if (auth.isSignedIn) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isLoaded, auth.isSignedIn]);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setError("");
    setInfo("");
    beacon("auth_action", { surface: "sign_up", action: "submit" });

    // Deterministic validation (fail fast).
    if (!nonEmpty(firstName) || !nonEmpty(lastName)) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!nonEmpty(emailAddress)) {
      setError("Please enter your email.");
      return;
    }
    if (!nonEmpty(password)) {
      setError("Please enter a password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await signUp.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        emailAddress,
        password
      });

      // Some Clerk instances may return a completed sign-up immediately.
      // If we have a created session, activate it and enter the app.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyRes = res as any;
      if (anyRes?.status === "complete" && anyRes?.createdSessionId) {
        await setActive({ session: anyRes.createdSessionId });
        beacon("auth_action", { surface: "sign_up", action: "complete" });
        router.replace("/");
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      setInfo("Check your email for a verification code.");
      beacon("auth_action", { surface: "sign_up", action: "verification_sent" });
    } catch (err) {
      const e = toUserFacingClerkError(err);
      if (e.code === "session_exists") {
        setError("You’re already signed in. Returning to the app…");
        beacon("auth_action", { surface: "sign_up", action: "session_exists" });
        router.replace("/");
        return;
      }
      beacon("auth_action", { surface: "sign_up", action: "error", code: e.code });
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    setError("");
    setInfo("");
    setVerifying(true);
    beacon("auth_action", { surface: "sign_up", action: "verify_submit" });

    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code
      });

      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        beacon("auth_action", { surface: "sign_up", action: "verify_complete" });
        router.replace("/");
      } else {
        setError("Verification not complete. Please check the code and try again.");
      }
    } catch (err) {
      const e = toUserFacingClerkError(err);
      if (e.code === "session_exists") {
        setError("You’re already signed in. Returning to the app…");
        beacon("auth_action", { surface: "sign_up", action: "session_exists" });
        router.replace("/");
        return;
      }
      beacon("auth_action", { surface: "sign_up", action: "verify_error", code: e.code });
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 20 }}>
          <Text style={{ color: Colors.text, fontSize: 28, fontWeight: "900" }}>Sign up</Text>
          <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
            Create your router account. You’ll only see approved jobs. Earnings are shown upfront.
          </Text>

          <Card style={{ marginTop: 16 }}>
            {pendingVerification ? (
              <>
                <Text style={{ color: Colors.text, fontSize: 18, fontWeight: "900" }}>
                  Verify your email
                </Text>
                <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
                  {info || "Enter the code we sent to your email."}
                </Text>

                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>
                  Verification code
                </Text>
                <TextInput
                  value={code}
                  placeholder="123456"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  onChangeText={(v) => setCode(v)}
                  keyboardType="number-pad"
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

                {info ? (
                  <Text style={{ color: Colors.muted, marginTop: 10, fontSize: 13 }}>
                    {info}
                  </Text>
                ) : null}
                {error ? (
                  <Text style={{ color: Colors.danger, marginTop: 10, fontSize: 13 }}>
                    {error}
                  </Text>
                ) : null}

                <View style={{ marginTop: 12 }}>
                  <PrimaryButton
                    label={verifying ? "Verifying…" : "Verify"}
                    onPress={() => void onVerifyPress()}
                    disabled={!isLoaded || verifying}
                    loading={verifying}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700" }}>
                  First name
                </Text>
                <TextInput
                  value={firstName}
                  placeholder="First name"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  onChangeText={(v) => setFirstName(v)}
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
                  Last name
                </Text>
                <TextInput
                  value={lastName}
                  placeholder="Last name"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  onChangeText={(v) => setLastName(v)}
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

                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700" }}>
                  Email
                </Text>
                <TextInput
                  autoCapitalize="none"
                  value={emailAddress}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  onChangeText={(email) => setEmailAddress(email)}
                  keyboardType="email-address"
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

                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>
                  Confirm password
                </Text>
                <TextInput
                  value={confirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  secureTextEntry={true}
                  onChangeText={(p) => setConfirmPassword(p)}
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
                    label={submitting ? "Creating…" : "Continue"}
                    onPress={() => void onSignUpPress()}
                    disabled={!isLoaded || submitting}
                    loading={submitting}
                  />
                </View>

                <View style={{ marginTop: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={{ color: Colors.muted }}>Already have an account?</Text>
                  <Link href="/sign-in" asChild>
                    <Pressable accessibilityRole="button" hitSlop={10}>
                      <SecondaryButtonSurface label="Sign in" />
                    </Pressable>
                  </Link>
                </View>
              </>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

