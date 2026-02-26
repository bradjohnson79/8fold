import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";

export async function getV4Readiness(userId: string) {
  const [userRows, contractorRows, routerRows, posterRows] = await Promise.all([
    db
      .select({ role: users.role, phone: users.phone, acceptedTosAt: users.acceptedTosAt, tosVersion: users.tosVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
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
      contractor.acceptedTosAt != null &&
      contractor.tosVersion &&
      contractor.tosVersion.trim().length > 0 &&
      Array.isArray(contractor.tradeCategories) &&
      contractor.tradeCategories.length > 0 &&
      contractor.homeLatitude != null &&
      contractor.homeLongitude != null &&
      contractor.formattedAddress &&
      contractor.formattedAddress.trim().length > 0 &&
      contractor.city &&
      contractor.city.trim().length > 0 &&
      contractor.postalCode &&
      contractor.postalCode.trim().length > 0 &&
      contractor.countryCode &&
      contractor.countryCode.trim().length > 0 &&
      contractor.startedTradeYear != null &&
      contractor.startedTradeMonth != null &&
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
  const hasAddress = Boolean(
    poster?.addressLine1 &&
      poster.addressLine1.trim().length > 0 &&
      poster.city &&
      poster.city.trim().length > 0 &&
      poster.postalCode &&
      poster.postalCode.trim().length > 0,
  );
  const hasMap = Boolean(
    poster &&
      poster.latitude != null &&
      poster.longitude != null &&
      Number.isFinite(poster.latitude) &&
      Number.isFinite(poster.longitude) &&
      !(poster.latitude === 0 && poster.longitude === 0),
  );
  const jobPosterReady = Boolean(hasAddress && hasMap);

  const jobPosterAcceptedTos = Boolean(user?.acceptedTosAt != null && user?.tosVersion && user.tosVersion.trim().length > 0);
  const contractorAcceptedTos = Boolean(
    contractor?.acceptedTosAt != null && contractor?.tosVersion && contractor.tosVersion.trim().length > 0
  );

  return {
    role: String(user?.role ?? "").toUpperCase(),
    jobPosterReady,
    jobPosterAcceptedTos,
    contractorAcceptedTos,
    contractorReady,
    routerReady,
    routes: {
      jobPoster: "/post-job",
      contractor: "/contractor/setup",
      router: "/router/setup",
    },
  };
}
