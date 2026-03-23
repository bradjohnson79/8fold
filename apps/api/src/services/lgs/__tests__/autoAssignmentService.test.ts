import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/drizzle", () => ({
  db: {},
}));

let buildGenericCampaignSeed: typeof import("../autoAssignmentService").buildGenericCampaignSeed;
let matchLeadToCampaign: typeof import("../autoAssignmentService").matchLeadToCampaign;

beforeAll(async () => {
  const mod = await import("../autoAssignmentService");
  buildGenericCampaignSeed = mod.buildGenericCampaignSeed;
  matchLeadToCampaign = mod.matchLeadToCampaign;
});

const createdAt = new Date("2026-03-21T12:00:00.000Z");

describe("matchLeadToCampaign", () => {
  it("matches contractor leads by pipeline, location, and trade", () => {
    const campaign = matchLeadToCampaign(
      {
        id: "lead_1",
        city: "Los Angeles",
        state: "CA",
        trade: "Roofing",
      },
      [
        {
          id: "campaign_1",
          name: "LA Roofing Contractor Campaign",
          campaignType: "contractor",
          state: "CA",
          cities: ["Los Angeles"],
          trades: ["Roofing"],
          categories: [],
          sources: ["google_maps"],
          createdAt,
        },
      ],
      "contractor"
    );

    expect(campaign?.id).toBe("campaign_1");
  });

  it("matches job leads by pipeline, location, and category", () => {
    const campaign = matchLeadToCampaign(
      {
        id: "lead_2",
        city: "San Jose",
        state: "CA",
        trade: null,
        category: "property_management",
      },
      [
        {
          id: "campaign_2",
          name: "SJ Property Management Jobs",
          campaignType: "jobs",
          state: "CA",
          cities: ["San Jose"],
          trades: [],
          categories: ["property_management"],
          sources: ["google_maps"],
          createdAt,
        },
      ],
      "jobs"
    );

    expect(campaign?.id).toBe("campaign_2");
  });

  it("does not match a campaign from the wrong pipeline", () => {
    const campaign = matchLeadToCampaign(
      {
        id: "lead_3",
        city: "Los Angeles",
        state: "CA",
        trade: "Roofing",
      },
      [
        {
          id: "campaign_3",
          name: "LA Roofing Jobs",
          campaignType: "jobs",
          state: "CA",
          cities: ["Los Angeles"],
          trades: [],
          categories: ["roofing"],
          sources: ["google_maps"],
          createdAt,
        },
      ],
      "contractor"
    );

    expect(campaign).toBeNull();
  });
});

describe("buildGenericCampaignSeed", () => {
  it("builds a contractor fallback campaign seed", () => {
    expect(
      buildGenericCampaignSeed(
        {
          id: "lead_4",
          city: "Los Angeles",
          state: "CA",
          trade: "Roofing",
        },
        "contractor"
      )
    ).toMatchObject({
      name: "Los Angeles General Contractors",
      campaignType: "contractor",
      state: "CA",
      cities: ["Los Angeles"],
      trades: ["General Contractors"],
    });
  });

  it("builds a jobs fallback campaign seed", () => {
    expect(
      buildGenericCampaignSeed(
        {
          id: "lead_5",
          city: "San Diego",
          state: "CA",
          trade: null,
          category: "business",
        },
        "jobs"
      )
    ).toMatchObject({
      name: "San Diego Job Posters",
      campaignType: "jobs",
      state: "CA",
      cities: ["San Diego"],
      categories: ["business"],
    });
  });
});
