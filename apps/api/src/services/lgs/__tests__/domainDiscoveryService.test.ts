import { describe, expect, it } from "vitest";
import {
  getEmailDomain,
  isCompanyDomainEmail,
  selectDiscoveryEmailsForDomain,
} from "../discoveryEmailHeuristics";

describe("discovery email heuristics", () => {
  it("recognizes exact company-domain emails", () => {
    expect(isCompanyDomainEmail("info@alphaoneconstructioninc.com", "alphaoneconstructioninc.com")).toBe(true);
  });

  it("recognizes subdomain company emails", () => {
    expect(isCompanyDomainEmail("sales@mail.alphaoneconstructioninc.com", "alphaoneconstructioninc.com")).toBe(true);
  });

  it("rejects free-provider emails for a contractor domain", () => {
    expect(isCompanyDomainEmail("owner@gmail.com", "alphaoneconstructioninc.com")).toBe(false);
  });

  it("rejects unrelated third-party business domains", () => {
    expect(isCompanyDomainEmail("filler@godaddy.com", "lifetimehomebuildersinc.com")).toBe(false);
  });

  it("extracts the email domain safely", () => {
    expect(getEmailDomain("Owner@Example.com")).toBe("example.com");
  });

  it("keeps only company-domain emails when mixed emails are found", () => {
    const result = selectDiscoveryEmailsForDomain(
      [
        "info@alphaoneconstructioninc.com",
        "owner@gmail.com",
        "sales@mail.alphaoneconstructioninc.com",
        "filler@godaddy.com",
      ],
      "alphaoneconstructioninc.com"
    );

    expect(result.acceptedEmails).toEqual([
      "info@alphaoneconstructioninc.com",
      "sales@mail.alphaoneconstructioninc.com",
    ]);
    expect(result.rejectedEmails).toEqual([
      "owner@gmail.com",
      "filler@godaddy.com",
    ]);
    expect(result.rejectionReason).toBeNull();
  });

  it("discards domains that only expose free-provider or off-domain addresses", () => {
    const result = selectDiscoveryEmailsForDomain(
      [
        "joelandcompany@gmail.com",
        "annaclaratambini@hotmail.com",
        "team@latofonts.com",
      ],
      "losangelesgeneralcontractor.com"
    );

    expect(result.acceptedEmails).toEqual([]);
    expect(result.rejectedEmails).toEqual([
      "joelandcompany@gmail.com",
      "annaclaratambini@hotmail.com",
      "team@latofonts.com",
    ]);
    expect(result.rejectionReason).toBe("no_company_domain_email");
  });
});
