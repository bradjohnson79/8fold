import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";

export async function getV4Readiness(userId: string) {
  const [userRows, contractorRows, routerRows, posterRows] = await Promise.all([
    db.select({ role: users.role, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(contractorProfilesV4).where(eq(contractorProfilesV4.userId, userId)).limit(1),
    db.select().from(routerProfilesV4).where(eq(routerProfilesV4.userId, userId)).limit(1),
    db.select().from(jobPosterProfilesV4).where(eq(jobPosterProfilesV4.userId, userId)).limit(1),
  ]);

  const user = userRows[0] ?? null;
  const contractor = contractorRows[0] ?? null;
  const router = routerRows[0] ?? null;
  const poster = posterRows[0] ?? null;

  const contractorReady = Boolean(
    contractor &&
      Array.isArray(contractor.tradeCategories) &&
      contractor.tradeCategories.length > 0 &&
      contractor.homeLatitude != null &&
      contractor.homeLongitude != null &&
      contractor.phone &&
      contractor.contactName &&
      contractor.businessName
  );
  const routerReady = Boolean(
    router &&
      Array.isArray(router.serviceAreas) &&
      router.serviceAreas.length > 0 &&
      router.homeLatitude != null &&
      router.homeLongitude != null &&
      router.phone &&
      router.homeRegion &&
      Array.isArray(router.availability) &&
      router.availability.length > 0
  );
  const jobPosterReady = Boolean(
    poster &&
      poster.latitude != null &&
      poster.longitude != null &&
      poster.formattedAddress &&
      poster.city &&
      poster.provinceState &&
      poster.postalCode
  );

  return {
    role: String(user?.role ?? "").toUpperCase(),
    jobPosterReady,
    contractorReady,
    routerReady,
    routes: {
      jobPoster: "/post-job",
      contractor: "/contractor/setup",
      router: "/router/setup",
    },
  };
}
