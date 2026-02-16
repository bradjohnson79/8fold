import { Tabs } from "expo-router";
import { beaconOnce } from "../../src/auth/runtimeSentinels";
import { useSession } from "../../src/auth/session";
import { Colors } from "../../components/ui";

export default function AppRoutesLayout() {
  const { isLoaded, sessionToken } = useSession();
  beaconOnce("app.layout.mount", "auth_boundary", { surface: "app_layout", isLoaded, hasSession: !!sessionToken });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.green,
        tabBarInactiveTintColor: "rgba(15,23,42,0.45)",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "rgba(15,23,42,0.08)",
          borderTopWidth: 1,
          paddingTop: 6,
          height: 64
        },
        tabBarLabelStyle: { fontWeight: "800", fontSize: 12 }
      }}
    >
      {/* Keep the redirect route but hide it from the tab bar */}
      <Tabs.Screen name="index" options={{ href: null }} />

      {/* Primary surface */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Earn $",
          tabBarLabel: "Earn $"
        }}
      />

      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarLabel: "Wallet"
        }}
      />

      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarLabel: "Menu"
        }}
      />

      {/* Secondary info routes live off Menu; hide from tab bar */}
      <Tabs.Screen name="faq" options={{ href: null }} />
    </Tabs>
  );
}

