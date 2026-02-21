/**
 * Deterministic step machine for Job Draft V2.
 * Backend uses allowedTransitions for advance validation.
 * Frontend must NOT infer next step; use backend-returned currentStep.
 */

export type Step = "PROFILE" | "DETAILS" | "PRICING" | "PAYMENT" | "CONFIRMED";

export const stepOrder: readonly Step[] = [
  "PROFILE",
  "DETAILS",
  "PRICING",
  "PAYMENT",
  "CONFIRMED",
] as const;

/**
 * Allowed transitions from each step.
 * advance route validates: allowedTransitions[currentStep] includes targetStep
 */
export const allowedTransitions: Record<Step, readonly Step[]> = {
  PROFILE: ["DETAILS"],
  DETAILS: ["PRICING"],
  PRICING: ["PAYMENT"],
  PAYMENT: ["CONFIRMED"],
  CONFIRMED: [],
};

export function getNextAllowedStep(current: Step): Step | null {
  const next = allowedTransitions[current];
  return next && next.length > 0 ? next[0] : null;
}

export function isTransitionAllowed(from: Step, to: Step): boolean {
  return (allowedTransitions[from] as readonly string[]).includes(to);
}
