export const PLATFORM_FEES = {
  contractor: 0.80,
  router: 0.08,
  platform: 0.12,
} as const;

export const REGIONAL_PLATFORM_FEES = {
  contractor: 0.85,
  router: 0.08,
  platform: 0.07,
} as const;

export const REGIONAL_PLATFORM_FLAT_FEE_CENTS = 2000;

export function getPlatformFees(isRegional: boolean) {
  return isRegional ? REGIONAL_PLATFORM_FEES : PLATFORM_FEES;
}
