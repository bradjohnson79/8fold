import { describe, expect, it } from "vitest";
import { parseDomainFile } from "../parseDomainFile";
import { shouldUseStructuredImport } from "../importLeadsService";

function parseCsv(csv: string) {
  return parseDomainFile(Buffer.from(csv, "utf8"), "text/csv");
}

describe("parseDomainFile", () => {
  it("parses full structured rows with normalized headers", () => {
    const parsed = parseCsv([
      "Website,Company,Address,City,State,Country,First Name,Last Name,Title,Email,Trade,Campaign Type,Category",
      "https://proper-handyman.com/path?utm=1,Proper Handyman,123 Market St,San Jose,ca,usa,Alex,Rivera,Owner,Alex@Proper-Handyman.com,Handyman,contractor,business",
    ].join("\n"));

    expect(parsed.rows).toEqual([
      {
        domain: "proper-handyman.com",
        company: "Proper Handyman",
        address: "123 Market St",
        city: "San Jose",
        state: "CA",
        country: "US",
        firstName: "Alex",
        lastName: "Rivera",
        title: "Owner",
        email: "alex@proper-handyman.com",
        trade: "Handyman",
        campaignType: "contractor",
        category: "business",
      },
    ]);
    expect(parsed.stats.accepted).toBe(1);
  });

  it("accepts missing email for enrichment-ready rows", () => {
    const parsed = parseCsv([
      "website,company,city,state,trade",
      "torreshandymanservice.com,Torres Handyman Service,San Jose,CA,Handyman",
    ].join("\n"));

    expect(parsed.rows[0]).toMatchObject({
      domain: "torreshandymanservice.com",
      company: "Torres Handyman Service",
      email: undefined,
      trade: "Handyman",
    });
    expect(parsed.stats.accepted).toBe(1);
  });

  it("accepts minimal website-only rows", () => {
    const parsed = parseCsv([
      "website",
      "abcroofing.com",
    ].join("\n"));

    expect(parsed.rows).toEqual([{ domain: "abcroofing.com" }]);
    expect(parsed.stats.accepted).toBe(1);
  });

  it("skips duplicate websites inside the file", () => {
    const parsed = parseCsv([
      "website",
      "abcroofing.com",
      "https://www.abcroofing.com/contact",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.stats.skipped_duplicate).toBe(1);
  });

  it("rejects rows with invalid email values", () => {
    const parsed = parseCsv([
      "website,email",
      "abcroofing.com,not-an-email",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.stats.skipped_invalid_email).toBe(1);
  });
});

describe("shouldUseStructuredImport", () => {
  it("returns false for legacy website-only contractor rows", () => {
    expect(shouldUseStructuredImport([{ domain: "abcroofing.com" }])).toBe(false);
  });

  it("returns true for structured contractor rows", () => {
    expect(
      shouldUseStructuredImport([
        { domain: "proper-handyman.com", company: "Proper Handyman", trade: "Handyman" },
      ])
    ).toBe(true);
  });

  it("returns true for job-poster rows so mixed pipeline imports route correctly", () => {
    expect(
      shouldUseStructuredImport([
        { domain: "property-manager.com", campaignType: "jobs", category: "property_management" },
      ])
    ).toBe(true);
  });

  it("forces structured import for the contractor upload route", () => {
    expect(
      shouldUseStructuredImport([{ domain: "abcroofing.com" }], { forceCampaignType: "contractor" })
    ).toBe(true);
  });
});
