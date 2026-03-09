import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4ContractorCertifications } from "@/db/schema/v4ContractorCertifications";
import { haversineKm } from "@/src/jobs/geo";

const KM_TO_MILES = 0.621371;

export async function getV4RouterRoutedJobs(userId: string) {
  const raw = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      title: jobs.title,
      scope: jobs.scope,
      region: jobs.region,
      routingStatus: jobs.routing_status,
      claimedAt: jobs.claimed_at,
      routedAt: jobs.routed_at,
      tradeCategory: jobs.trade_category,
      routerEarningsCents: jobs.router_earnings_cents,
      estimatedCompletionDate: jobs.estimated_completion_date,
      contractorUserId: jobs.contractor_user_id,
      lat: jobs.lat,
      lng: jobs.lng,
      countryCode: jobs.country_code,
    })
    .from(jobs)
    .where(eq(jobs.claimed_by_user_id, userId))
    .orderBy(desc(jobs.claimed_at), desc(jobs.id))
    .limit(100);

  const contractorIds = [...new Set(raw.map((j) => j.contractorUserId).filter(Boolean))] as string[];
  const contractorRows =
    contractorIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, contractorIds))
      : [];
  const contractorMap = new Map(contractorRows.map((r) => [r.id, { id: r.id, name: String(r.name ?? "").trim() || "Contractor" }]));

  const jobIds = raw.map((j) => j.id);
  const inviteRows =
    jobIds.length > 0
      ? await db
          .select({
            jobId: v4ContractorJobInvites.jobId,
            contractorId: v4ContractorJobInvites.contractorUserId,
            contactName: contractorProfilesV4.contactName,
            businessName: contractorProfilesV4.businessName,
            city: contractorProfilesV4.city,
            homeLatitude: contractorProfilesV4.homeLatitude,
            homeLongitude: contractorProfilesV4.homeLongitude,
          })
          .from(v4ContractorJobInvites)
          .innerJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, v4ContractorJobInvites.contractorUserId))
          .where(inArray(v4ContractorJobInvites.jobId, jobIds))
          .orderBy(v4ContractorJobInvites.createdAt)
      : [];

  // Build a lookup of job coords for distance calculation
  const jobCoordsMap = new Map(
    raw.map((j) => [j.id, { lat: j.lat, lng: j.lng }]),
  );

  type CertPreview = {
    certificationName: string;
    certificateImageUrl: string;
    verified: boolean;
    issuingOrganization: string | null;
  };

  type InvitedContractor = {
    contractorId: string;
    contactName: string;
    businessName: string;
    city: string | null;
    distanceKm: number | null;
    distanceMiles: number | null;
    availabilityStatus: "AVAILABLE" | "BUSY";
    certifications: CertPreview[];
  };

  const inviteMap = new Map<string, InvitedContractor[]>();
  for (const row of inviteRows) {
    if (!inviteMap.has(row.jobId)) inviteMap.set(row.jobId, []);
    const jobCoords = jobCoordsMap.get(row.jobId);
    let distanceKm: number | null = null;
    let distanceMiles: number | null = null;
    if (
      jobCoords &&
      Number.isFinite(jobCoords.lat) &&
      Number.isFinite(jobCoords.lng) &&
      Number.isFinite(row.homeLatitude) &&
      Number.isFinite(row.homeLongitude)
    ) {
      distanceKm = haversineKm(
        { lat: jobCoords.lat!, lng: jobCoords.lng! },
        { lat: row.homeLatitude, lng: row.homeLongitude },
      );
      distanceMiles = distanceKm * KM_TO_MILES;
    }
    inviteMap.get(row.jobId)!.push({
      contractorId: row.contractorId,
      contactName: row.contactName,
      businessName: row.businessName,
      city: row.city,
      distanceKm,
      distanceMiles,
      availabilityStatus: "AVAILABLE",
      certifications: [],
    });
  }

  // Batch availability query for all invited contractors
  const allContractorIds = [...new Set(inviteRows.map((r) => r.contractorId))];
  if (allContractorIds.length > 0) {
    const activeJobs = await db
      .select({
        contractorUserId: jobs.contractor_user_id,
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(
        and(
          inArray(jobs.contractor_user_id, allContractorIds),
          inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS", "JOB_STARTED"]),
        ),
      )
      .groupBy(jobs.contractor_user_id);

    const busySet = new Set(activeJobs.map((r) => r.contractorUserId));
    for (const contractors of inviteMap.values()) {
      for (const c of contractors) {
        if (busySet.has(c.contractorId)) c.availabilityStatus = "BUSY";
      }
    }

    // Batch-load certifications that have an image URL (for thumbnail display)
    const certRows = await db
      .select({
        contractorUserId: v4ContractorCertifications.contractorUserId,
        certificationName: v4ContractorCertifications.certificationName,
        certificateImageUrl: v4ContractorCertifications.certificateImageUrl,
        issuingOrganization: v4ContractorCertifications.issuingOrganization,
        verified: v4ContractorCertifications.verified,
      })
      .from(v4ContractorCertifications)
      .where(
        and(
          inArray(v4ContractorCertifications.contractorUserId, allContractorIds),
          isNotNull(v4ContractorCertifications.certificateImageUrl),
        ),
      );

    const certsByContractor = new Map<string, CertPreview[]>();
    for (const cert of certRows) {
      if (!cert.certificateImageUrl) continue;
      const list = certsByContractor.get(cert.contractorUserId) ?? [];
      list.push({
        certificationName: cert.certificationName,
        certificateImageUrl: cert.certificateImageUrl,
        issuingOrganization: cert.issuingOrganization,
        verified: cert.verified,
      });
      certsByContractor.set(cert.contractorUserId, list);
    }

    for (const contractors of inviteMap.values()) {
      for (const c of contractors) {
        c.certifications = certsByContractor.get(c.contractorId) ?? [];
      }
    }
  }

  return {
    jobs: raw.map((j) => ({
      id: j.id,
      status: j.status,
      title: j.title,
      scope: j.scope,
      region: j.region,
      routingStatus: j.routingStatus,
      countryCode: j.countryCode,
      claimedAt: j.claimedAt ? j.claimedAt.toISOString() : null,
      routedAt: j.routedAt ? j.routedAt.toISOString() : null,
      tradeCategory: j.tradeCategory ?? "",
      routerEarningsCents: Number(j.routerEarningsCents ?? 0),
      estimatedCompletionDate: j.estimatedCompletionDate ? j.estimatedCompletionDate.toISOString().slice(0, 10) : null,
      contractor: j.contractorUserId ? contractorMap.get(j.contractorUserId) ?? null : null,
      invitedContractors: inviteMap.get(j.id) ?? [],
    })),
  };
}
