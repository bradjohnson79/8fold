import { computeBodyHash } from "./outreachHashService";

export type JobPosterMessageInput = {
  companyName?: string | null;
  contactName?: string | null;
  city?: string | null;
  category?: string | null;
};

export type JobPosterMessageOutput = {
  subject: string;
  body: string;
  hash: string;
};

function getGreetingName(input: JobPosterMessageInput): string {
  if (input.contactName?.trim()) return input.contactName.trim();
  if (input.companyName?.trim()) return input.companyName.trim();
  return "there";
}

export function generateJobPosterMessage(input: JobPosterMessageInput): JobPosterMessageOutput {
  const city = input.city?.trim() || "your area";
  const name = getGreetingName(input);
  const subject = `Quick question about projects in ${city}`;
  const categoryLine = input.category?.trim()
    ? `We’re reaching out to ${input.category.replace(/_/g, " ")} operators in ${city} who may need reliable contractor coverage.`
    : `We’re connecting property owners and businesses in ${city} with reliable contractors and wanted to see if this is something you’d be open to.`;

  const body = [
    `Hey ${name},`,
    "",
    "Are you currently looking for contractors for any upcoming work?",
    "",
    categoryLine,
    "",
    "No pressure either way - just thought I’d ask.",
    "",
    "- Brad Johnson",
  ].join("\n");

  return {
    subject,
    body,
    hash: computeBodyHash(body),
  };
}
