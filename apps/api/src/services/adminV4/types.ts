export type AdminPartySummary = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

export type AdminJobPaymentState = {
  paid: boolean;
  refunded: boolean;
  label: "UNPAID" | "PAID" | "REFUNDED";
  rawPaymentStatus: string | null;
  rawPayoutStatus: string | null;
};

export type AdminJobRow = {
  id: string;
  title: string;
  statusRaw: string;
  displayStatus: string;
  isMock: boolean;
  country: string;
  regionCode: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
  amountCents: number;
  paymentState: AdminJobPaymentState;
  jobPoster: AdminPartySummary | null;
  router: AdminPartySummary | null;
  contractor: AdminPartySummary | null;
  routingStatus: string;
  tradeCategory: string;
  addressFull: string | null;
  archived: boolean;
  cancelRequestPending: boolean;
};

export type AdminTimelineEvent = {
  at: string;
  type: string;
  label: string;
  source: "job" | "dispatch" | "assignment" | "audit";
  detail: string | null;
  actor: string | null;
};

export type AdminJobDetail = {
  id: string;
  title: string;
  description: string;
  scope: string;
  tradeCategory: string;
  country: string;
  regionCode: string | null;
  city: string | null;
  postalCode: string | null;
  addressFull: string | null;
  lat: number | null;
  lng: number | null;
  statusRaw: string;
  displayStatus: string;
  routingStatus: string;
  isMock: boolean;
  jobSource: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archived: boolean;
  paymentState: AdminJobPaymentState;
  amountCents: number;
  paymentStatus: string | null;
  payoutStatus: string | null;
  financialSummary: {
    appraisalSubtotalCents: number;
    regionalFeeCents: number;
    taxRateBps: number;
    taxAmountCents: number;
    totalAmountCents: number;
    country: string;
    province: string | null;
    stripePaymentIntentId: string | null;
    stripePaymentIntentStatus: string | null;
    stripePaidAt: string | null;
    stripeRefundedAt: string | null;
    stripeCanceledAt: string | null;
    ledgerByType: Array<{ type: string; count: number; creditsCents: number; debitsCents: number }>;
  };
  jobPoster: AdminPartySummary | null;
  router: AdminPartySummary | null;
  contractor: AdminPartySummary | null;
  adminRoutedById: string | null;
};

export type AdminJobRelated = {
  pmRequests: { count: number; latest: string | null };
  receipts: { count: number; latest: string | null };
  messages: { threadCount: number; messageCount: number };
};

export type AdminJobsListResult = {
  rows: AdminJobRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type AdminUserListRow = {
  id: string;
  role: "CONTRACTOR" | "JOB_POSTER" | "ROUTER";
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  status: string;
  suspendedUntil: string | null;
  archivedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  badges: string[];
};

export type AdminUsersListResult = {
  rows: AdminUserListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type AdminUserJobRef = {
  id: string;
  title: string;
  statusRaw: string;
  displayStatus: string;
  createdAt: string;
  updatedAt: string;
  amountCents: number;
};

export type AdminUserProfile = {
  id: string;
  role: "CONTRACTOR" | "JOB_POSTER" | "ROUTER";
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  serviceRegion: string | null;
  verification: {
    termsAccepted: boolean | null;
    profileComplete: boolean | null;
    approved: boolean | null;
  };
  paymentSetup: {
    hasPayoutMethod: boolean;
    stripeConnected: boolean;
    payoutStatus: string | null;
  };
  metadata: Record<string, unknown>;
};

export type AdminAccountStatus = {
  status: string;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  disabled: boolean;
  lastLoginAt: string | null;
};

export type AdminPayoutReadiness = {
  hasPayoutMethod: boolean;
  stripeConnected: boolean;
  eligible: boolean;
  blockers: string[];
};

export type AdminRoleDetail = {
  profile: AdminUserProfile;
  accountStatus: AdminAccountStatus;
  recentJobs: AdminUserJobRef[];
  payoutReadiness: AdminPayoutReadiness;
  scoreAppraisal?: {
    pending: boolean;
    jobsEvaluated: number;
    minimumRequired: number;
    appraisal?: {
      avgPunctuality: number | null;
      avgCommunication: number | null;
      avgQuality: number | null;
      avgCooperation: number | null;
      totalScore: number | null;
    };
    version?: string;
    updatedAt?: string | null;
  };
  aiEnforcement?: {
    events: number;
    disputes: number;
    latestActionTaken: string | null;
  };
  enforcement: {
    strikes?: number;
    flags?: number;
    suspendedUntil?: string | null;
    archivedAt?: string | null;
  };
};
