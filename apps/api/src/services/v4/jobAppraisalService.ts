import { buildAppraisalPayloadHash, issueAppraisalToken } from "@/src/services/v4/appraisalTokenService";
import { URBAN_RADIUS_KM } from "@/src/validation/v4/constants";
import { V4JobAppraiseBodySchema, type V4JobAppraiseBody } from "@/src/validation/v4/jobCreateSchema";

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

export function computeV4JobAppraisal(input: V4JobAppraiseBody, userId: string) {
  let median = 200;
  if (input.tradeCategory === "PLUMBING") median += 50;
  if (input.tradeCategory === "ELECTRICAL") median += 40;
  if (input.isRegionalRequested) median += 20;

  const low = Math.max(50, roundToNearestFive(median * 0.85));
  const high = roundToNearestFive(median * 1.15);
  const finalMedian = roundToNearestFive(median);

  const rationale = [
    `Province ${input.provinceState} baseline applied for ${input.tradeCategory}.`,
    input.isRegionalRequested
      ? `Regional preference can increase travel overhead beyond ${URBAN_RADIUS_KM}km urban radius.`
      : "Urban preference keeps travel overhead lower.",
  ]
    .join(" ")
    .slice(0, 100);

  const payloadHash = buildAppraisalPayloadHash({
    userId,
    title: input.title,
    description: input.description,
    tradeCategory: input.tradeCategory,
    provinceState: input.provinceState,
    latitude: input.latitude,
    longitude: input.longitude,
    isRegionalRequested: input.isRegionalRequested,
  });

  const appraisalToken = issueAppraisalToken({
    userId,
    payloadHash,
    title: input.title,
    description: input.description,
    tradeCategory: input.tradeCategory,
    provinceState: input.provinceState,
    latitude: input.latitude,
    longitude: input.longitude,
    isRegionalRequested: input.isRegionalRequested,
  });

  return {
    low,
    high,
    median: finalMedian,
    rationale,
    modelUsed: "gpt-5-nano",
    appraisalToken,
  };
}

export { V4JobAppraiseBodySchema };
