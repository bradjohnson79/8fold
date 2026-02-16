/**
 * Job statuses shown on the public homepage "Newest jobs across the marketplace".
 * Use this constant to avoid enum drift when JobStatus evolves.
 */
export const PUBLIC_MARKETPLACE_JOB_STATUSES = [
  "OPEN_FOR_ROUTING",
  "ASSIGNED",
  "IN_PROGRESS",
] as const;
