export const PAYOUT_RELEASE_INITIATED = "PAYOUT_RELEASE_INITIATED" as const;
export const CONTRACTOR_TRANSFER_CREATED = "CONTRACTOR_TRANSFER_CREATED" as const;
export const ROUTER_COMMISSION_EARNED = "ROUTER_COMMISSION_EARNED" as const;
export const ROUTER_COMMISSION_PLATFORM_RETAINED = "ROUTER_COMMISSION_PLATFORM_RETAINED" as const;
export const ROUTER_TRANSFER_CREATED = "ROUTER_TRANSFER_CREATED" as const;
export const PLATFORM_REVENUE_RECORDED = "PLATFORM_REVENUE_RECORDED" as const;
export const FUNDS_RELEASED_FINAL = "FUNDS_RELEASED_FINAL" as const;

export const payoutDedupeKeys = {
  payoutInit: (jobId: string) => `payout_init:${jobId}`,
  contractorTransfer: (jobId: string) => `transfer_contractor:${jobId}`,
  routerCommissionEarned: (jobId: string) => `router_commission_earned:${jobId}`,
  routerCommissionRetained: (jobId: string) => `router_commission_retained:${jobId}`,
  routerTransfer: (jobId: string) => `transfer_router:${jobId}`,
  platformRevenue: (jobId: string) => `platform_revenue:${jobId}`,
  fundsReleased: (jobId: string) => `funds_released:${jobId}`,
} as const;
