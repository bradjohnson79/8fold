import React from "react";
import { Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "./ui";

export function BackButton({
  fallbackHref = "/jobs",
  label = "Back"
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  const onPress = () => {
    // Prefer actual navigation history when available.
    // If the screen was opened as the first route, fallback to a known safe screen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyRouter = router as any;
    if (typeof anyRouter.canGoBack === "function" && anyRouter.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
    >
      <Text style={{ color: Colors.blue, fontWeight: "900" }}>← {label}</Text>
    </Pressable>
  );
}

