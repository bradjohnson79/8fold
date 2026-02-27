import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";

const ROUTER_TOS_VERSION = "v1.0";

export async function getV4Readiness(userId: string) {
  const [userRows, contractorAccountRows, routerRows, posterRows] = await Promise.all([
    db
      .select({
        role: users.role,
        phone: users.phone,
        acceptedTosAt: users.acceptedTosAt,
        tosVersion: users.tosVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select()
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1),
    db
      .select()
      .from(routerProfilesV4)
      .where(eq(routerProfilesV4.userId, userId))
      .limit(1),
    db
      .select()
      .from(jobPosterProfilesV4)
      .where(eq(jobPosterProfilesV4.userId, userId))
      .limit(1),
  ]);

  const user = userRows[0] ?? null;
  const contractorAccount = contractorAccountRows[0] ?? null;
  const router = routerRows[0] ?? null;
  const poster = posterRows[0] ?? null;

  const contractorReady = Boolean(
    contractorAccount &&
      contractorAccount.isActive === true &&
      contractorAccount.wizardCompleted === true,
  );
  const routerAcceptedTos = user?.tosVersion === ROUTER_TOS_VERSION;
  const routerReady = Boolean(
    router &&
    routerAcceptedTos &&
    Array.isArray(router.serviceAreas) &&
    router.serviceAreas.length > 0 &&
    router.homeLatitude != null &&
    router.homeLongitude != null &&
    router.phone &&
    router.homeRegion &&
    router.homeCountryCode &&
    router.homeRegionCode &&
    Array.isArray(router.availability) &&
    router.availability.length > 0,
  );
  const hasAddress = Boolean(
    poster &&
    poster.addressLine1 &&
    poster.addressLine1.trim().length > 0 &&
    poster.city &&
    poster.city.trim().length > 0 &&
    poster.provinceState &&
    poster.provinceState.trim().length > 0 &&
    poster.country &&
    poster.country.trim().length > 0,
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

  const jobPosterAcceptedTos = Boolean(
    user?.acceptedTosAt != null &&
    user?.tosVersion &&
    user.tosVersion.trim().length > 0,
  );
  const contractorAcceptedTos = Boolean(
    contractorAccount &&
      contractorAccount.waiverAccepted === true &&
      contractorAccount.waiverAcceptedAt != null,
  );

  return {
    role: String(user?.role ?? "").toUpperCase(),
    jobPosterReady,
    jobPosterAcceptedTos,
    contractorAcceptedTos,
    contractorReady,
    routerReady,
    routerAcceptedTos,
    routes: {
      jobPoster: "/post-job",
      contractor: "/contractor/setup",
      router: "/dashboard/setup",
    },
  };
}
