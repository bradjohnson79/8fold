import { redirect } from "next/navigation";

/**
 * Legacy contractor app redirect.
 * Contractors now use the V4 dashboard at /dashboard/contractor.
 * All /app/contractor/* routes redirect to the V4 dashboard.
 */
export default function ContractorRedirectLayout() {
  redirect("/dashboard/contractor");
}
