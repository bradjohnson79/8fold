import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export const Colors = {
  // Light, calm, service-platform palette
  // App canvas: slight off-white so cards feel elevated (matches reference look)
  bg: "#F6F8FB",
  card: "#F8FAFC",
  cardWhite: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  muted: "#6B7280",
  blue: "#2563EB",
  green: "#16A34A",
  orange: "#F59E0B",
  danger: "#DC2626"
} as const;

function heroForServiceType(serviceType: string) {
  const key = (serviceType ?? "").trim().toLowerCase();
  if (key.includes("plumb")) return { bg: "#DBEAFE", fg: "#1D4ED8", label: "Plumbing" };
  if (key.includes("elect")) return { bg: "#E0E7FF", fg: "#3730A3", label: "Electrical" };
  if (key.includes("drywall")) return { bg: "#E2E8F0", fg: "#334155", label: "Drywall" };
  if (key.includes("roof")) return { bg: "#FFE4E6", fg: "#9F1239", label: "Roofing" };
  if (key.includes("weld")) return { bg: "#FEE2E2", fg: "#991B1B", label: "Welding" };
  if (key.includes("junk")) return { bg: "#DCFCE7", fg: "#166534", label: "Junk Removal" };
  if (key.includes("yard")) return { bg: "#ECFCCB", fg: "#365314", label: "Yardwork" };
  if (key.includes("carp")) return { bg: "#FFE4C7", fg: "#9A3412", label: "Carpentry" };
  return { bg: "#EEF2FF", fg: "#3730A3", label: "Service" };
}

export function JobHero({
  serviceType,
  height = 118
}: {
  serviceType: string;
  height?: number;
}) {
  const h = heroForServiceType(serviceType);
  return (
    <View
      style={{
        height,
        backgroundColor: h.bg,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(15,23,42,0.06)",
        padding: 14,
        justifyContent: "flex-end"
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: h.fg, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }}>
            {h.label}
          </Text>
          <Text style={{ color: "rgba(15,23,42,0.60)", marginTop: 4, fontSize: 12 }}>
            Verified payout · Clear scope
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.65)",
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.08)",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text style={{ color: h.fg, fontWeight: "900", fontSize: 16 }}>
            {(h.label[0] ?? "S").toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function Card({
  children,
  style
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.cardWhite,
          borderColor: Colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: Colors.green,
        borderRadius: 16,
        minHeight: 48,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled || loading ? 0.65 : 1
      }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function PrimaryButtonSurface({
  label,
  loading
}: {
  label: string;
  loading?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.green,
        borderRadius: 16,
        minHeight: 48,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
          {label}
        </Text>
      )}
    </View>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        opacity: disabled ? 0.6 : 1
      }}
    >
      <Text style={{ color: Colors.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButtonSurface({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF"
      }}
    >
      <Text style={{ color: Colors.text, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View
      style={{
        marginTop: 12,
        borderWidth: 1,
        borderColor: "rgba(220,38,38,0.25)",
        backgroundColor: "rgba(220,38,38,0.05)",
        borderRadius: 14,
        padding: 12
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.danger, fontWeight: "900" }}>Couldn’t load</Text>
          <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
            {message}
          </Text>
        </View>
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={10}>
            <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 13 }}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "900" }}>
        {title}
      </Text>
      <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <View style={{ marginTop: 12, alignSelf: "flex-start" }}>
          <SecondaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Card>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ gap: 10 }}>
        <View
          style={{
            height: 16,
            width: "70%",
            borderRadius: 8,
            backgroundColor: "rgba(15,23,42,0.08)"
          }}
        />
        {Array.from({ length: lines }).map((_, i) => (
          <View
            key={i}
            style={{
              height: 12,
              width: i === lines - 1 ? "55%" : "90%",
              borderRadius: 8,
              backgroundColor: "rgba(15,23,42,0.06)"
            }}
          />
        ))}
        <View
          style={{
            height: 22,
            width: 120,
            borderRadius: 10,
            backgroundColor: "rgba(15,23,42,0.08)"
          }}
        />
      </View>
    </Card>
  );
}

export type JobStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "CONTRACTOR_COMPLETED"
  | "CUSTOMER_APPROVED"
  | "CUSTOMER_REJECTED"
  | "COMPLETION_FLAGGED"
  | "COMPLETED_APPROVED";

export function getJobStatusDisplay(status: JobStatus): { label: string; color: string } {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", color: "rgba(15,23,42,0.45)" };
    case "PUBLISHED":
      return { label: "Available", color: Colors.green };
    case "ASSIGNED":
      return { label: "Assigned", color: Colors.blue };
    case "IN_PROGRESS":
      return { label: "In progress", color: Colors.blue };
    case "CONTRACTOR_COMPLETED":
      return { label: "Awaiting customer", color: Colors.blue };
    case "CUSTOMER_APPROVED":
      return { label: "Awaiting your approval", color: Colors.blue };
    case "CUSTOMER_REJECTED":
      return { label: "Customer rejected", color: Colors.danger };
    case "COMPLETION_FLAGGED":
      return { label: "Flagged / hold", color: Colors.orange };
    case "COMPLETED_APPROVED":
      return { label: "Completed approved", color: Colors.green };
    default:
      return { label: status, color: "rgba(15,23,42,0.45)" };
  }
}

export function StatusBadge({
  label,
  color
}: {
  label: string;
  color: string;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: "rgba(255,255,255,0.85)"
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function normalizeUserSafeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.trim();
  if (!msg) return "Please try again.";
  if (msg.includes("Missing EXPO_PUBLIC_API_ORIGIN")) {
    return "The app isn’t configured to reach the server yet.";
  }
  if (msg.includes("Unauthorized") || msg.includes("Forbidden")) {
    return "You don’t have access to this action.";
  }
  if (msg.includes("Job already claimed")) {
    return "That job was just claimed by someone else.";
  }
  if (msg.includes("You already have an active job")) {
    return "You already have an active job. Finish it before claiming another.";
  }
  if (msg.includes("Job no longer available")) {
    return "That job is no longer available.";
  }
  if (msg.includes("No available balance")) {
    return "You don’t have an available balance yet.";
  }
  return "Something didn’t work. Please try again.";
}

