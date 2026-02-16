import { Stack } from "expo-router";
import { beaconOnce } from "../../src/auth/runtimeSentinels";
import { useSession } from "../../src/auth/session";

export default function AuthRoutesLayout() {
  const { isLoaded, sessionToken } = useSession();
  beaconOnce("auth.layout.mount", "auth_boundary", { surface: "auth_layout", isLoaded, hasSession: !!sessionToken });

  return <Stack screenOptions={{ headerShown: false }} />;
}

