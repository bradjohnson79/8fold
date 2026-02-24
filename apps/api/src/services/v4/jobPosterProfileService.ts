import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { type V4JobPosterProfileInput } from "@/src/validation/v4/jobPosterProfileSchema";

export async function getV4JobPosterProfile(userId: string) {
  const rows = await db.select().from(jobPosterProfilesV4).where(eq(jobPosterProfilesV4.userId, userId)).limit(1);
  const profile = rows[0] ?? null;
  return { ok: true as const, profile };
}

export async function saveV4JobPosterProfile(userId: string, input: V4JobPosterProfileInput) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(jobPosterProfilesV4)
      .values({
        id: randomUUID(),
        userId,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 || null,
        city: input.city,
        provinceState: input.provinceState,
        postalCode: input.postalCode,
        country: input.country,
        formattedAddress: input.formattedAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        geocodeProvider: input.geocodeProvider,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: jobPosterProfilesV4.userId,
        set: {
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 || null,
          city: input.city,
          provinceState: input.provinceState,
          postalCode: input.postalCode,
          country: input.country,
          formattedAddress: input.formattedAddress,
          latitude: input.latitude,
          longitude: input.longitude,
          geocodeProvider: input.geocodeProvider,
          updatedAt: now,
        },
      });
  });
}
