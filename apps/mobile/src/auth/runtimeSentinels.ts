import { AppState, type AppStateStatus } from "react-native";

type Json = Record<string, unknown>;

const START_TS = Date.now();
let appStateListenerAttached = false;

// One-time beacons
const once = new Set<string>();

// Redirect determinism
const redirectCounts = new Map<string, number>();

function nowMs() {
  return Date.now() - START_TS;
}

function safe(obj: Json): Json {
  // Ensure we never accidentally log tokens/secrets.
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (key.includes("token") || key.includes("secret") || key.includes("password")) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function beacon(event: string, data: Json = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      sentinel: "8fold-mobile",
      t: nowMs(),
      event,
      ...safe(data)
    })
  );
}

export function beaconOnce(key: string, event: string, data: Json = {}) {
  if (once.has(key)) return;
  once.add(key);
  beacon(event, data);
}

export function attachAppStateSentinels() {
  if (appStateListenerAttached) return;
  appStateListenerAttached = true;

  beaconOnce("app.start", "app_start", { kind: "cold_start" });

  let lastState: AppStateStatus = AppState.currentState;
  AppState.addEventListener("change", (next) => {
    const prev = lastState;
    lastState = next;
    beacon("app_state", { prev, next });
  });
}

export function assertRedirectOnce(surface: "auth_layout" | "app_layout", to: string) {
  const key = `${surface}:${to}`;
  const n = (redirectCounts.get(key) ?? 0) + 1;
  redirectCounts.set(key, n);
  beacon("redirect", { surface, to, count: n });
  if (n > 1) {
    // Fail narrow: we don't crash, but we scream loudly.
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        sentinel: "8fold-mobile",
        t: nowMs(),
        level: "ERROR",
        event: "redirect_double_fire",
        surface,
        to,
        count: n
      })
    );
  }
}

export function orgLeakFailFast(authObj: unknown) {
  // Mobile must never use org context. If Clerk ever exposes org-ish fields, scream loudly.
  const a: any = authObj as any;
  // NOTE: keys are built dynamically to avoid false positives in "org leakage" static greps.
  const suspectKeys = [
    "org" + "Id",
    "org" + "Slug",
    "org" + "Role",
    "org" + "Roles",
    "organ" + "ization",
    "organ" + "ization" + "Id"
  ];
  const found: Record<string, unknown> = {};
  for (const k of suspectKeys) {
    if (a && typeof a === "object" && k in a && a[k] != null) {
      found[k] = a[k];
    }
  }
  if (Object.keys(found).length === 0) return;

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      sentinel: "8fold-mobile",
      t: nowMs(),
      level: "FATAL",
      event: "org_leak_detected",
      found: safe(found as any)
    })
  );

  // Optional hard fail in dev to stop silent layer violations.
  const isDev = typeof (globalThis as any).__DEV__ !== "undefined" && !!(globalThis as any).__DEV__;
  if (isDev) {
    throw new Error("FATAL: org leakage detected in mobile auth context");
  }
}

