import { z } from "zod";

/**
 * Canonical application roles (single-role accounts).
 *
 * Legacy roles are intentionally not supported.
 */
export const UserRoleSchema = z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

