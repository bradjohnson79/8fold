import Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/src/services/stripeGateway/stripeClient";
import { requireStripeIntegrityReadKey } from "./env";

const MUTATION_ERROR = "INTEGRITY_CLIENT_MUTATION_BLOCKED";
const BLOCKED_PATHS = new Set([
  "paymentintents.create",
  "refunds.create",
  "transfers.create",
  "payout.create",
  "payouts.create",
  "charges.capture",
]);
const BLOCKED_METHODS = new Set(["create", "update", "delete"]);

function normalizePath(parts: string[]): string {
  return parts.join(".").toLowerCase();
}

function shouldBlockMutation(pathParts: string[]): boolean {
  const path = normalizePath(pathParts);
  if (BLOCKED_PATHS.has(path)) return true;
  const leaf = pathParts[pathParts.length - 1]?.toLowerCase() ?? "";
  return BLOCKED_METHODS.has(leaf);
}

function blockedMutation(): never {
  throw new Error(MUTATION_ERROR);
}

function withReadOnlyGuard<T extends object>(root: T): T {
  const cache = new WeakMap<object, unknown>();

  const wrap = (target: any, pathParts: string[]): any => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) return target;
    if (cache.has(target)) return cache.get(target);

    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof prop === "symbol") return value;

        const nextPath = [...pathParts, String(prop)];
        if (typeof value === "function") {
          if (shouldBlockMutation(nextPath)) {
            return blockedMutation;
          }
          return value.bind(obj);
        }

        if (value && (typeof value === "object" || typeof value === "function")) {
          return wrap(value, nextPath);
        }

        return value;
      },
    });

    cache.set(target, proxy);
    return proxy;
  };

  return wrap(root, []) as T;
}

const baseStripeIntegrityClient = new Stripe(requireStripeIntegrityReadKey(), {
  apiVersion: STRIPE_API_VERSION,
  maxNetworkRetries: 2,
  timeout: 10_000,
});

export const stripeIntegrity: Stripe = withReadOnlyGuard(baseStripeIntegrityClient);
