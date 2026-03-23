function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCompanyDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function getEmailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function isCompanyDomainEmail(email: string, companyDomain: string): boolean {
  const emailDomain = getEmailDomain(email);
  const normalizedCompanyDomain = normalizeCompanyDomain(companyDomain);
  if (!emailDomain || !normalizedCompanyDomain) return false;
  return emailDomain === normalizedCompanyDomain || emailDomain.endsWith(`.${normalizedCompanyDomain}`);
}

export function selectDiscoveryEmailsForDomain(
  emails: string[],
  companyDomain: string
): {
  acceptedEmails: string[];
  rejectedEmails: string[];
  rejectionReason: "no_company_domain_email" | null;
} {
  const uniqueEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const acceptedEmails = uniqueEmails.filter((email) => isCompanyDomainEmail(email, companyDomain));
  const rejectedEmails = uniqueEmails.filter((email) => !isCompanyDomainEmail(email, companyDomain));

  return {
    acceptedEmails,
    rejectedEmails,
    rejectionReason: acceptedEmails.length === 0 && rejectedEmails.length > 0
      ? "no_company_domain_email"
      : null,
  };
}
