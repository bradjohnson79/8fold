import { getSeoSettings } from "./seoSettingsService";

export interface DistributionConfig {
  facebook: boolean;
  linkedin: boolean;
  reddit: boolean;
  twitter: boolean;
}

export interface DistributionPayload {
  title: string;
  url: string;
  description?: string;
}

export interface DistributionResult {
  platform: keyof DistributionConfig;
  status: "sent" | "skipped" | "error";
  message?: string;
}

export async function getDistributionConfig(): Promise<DistributionConfig> {
  const settings = await getSeoSettings();
  const raw = settings?.distributionConfig as Record<string, unknown> | null | undefined;

  return {
    facebook: Boolean(raw?.facebook ?? false),
    linkedin: Boolean(raw?.linkedin ?? false),
    reddit: Boolean(raw?.reddit ?? false),
    twitter: Boolean(raw?.twitter ?? false),
  };
}

// Individual platform stubs — replace with real API calls when keys are available
async function postToFacebook(payload: DistributionPayload): Promise<DistributionResult> {
  // TODO: implement Meta Graph API posting
  console.info("[distribution] Facebook post stub", { url: payload.url });
  return { platform: "facebook", status: "skipped", message: "Facebook API not configured" };
}

async function postToLinkedIn(payload: DistributionPayload): Promise<DistributionResult> {
  // TODO: implement LinkedIn Share API
  console.info("[distribution] LinkedIn post stub", { url: payload.url });
  return { platform: "linkedin", status: "skipped", message: "LinkedIn API not configured" };
}

async function postToReddit(payload: DistributionPayload): Promise<DistributionResult> {
  // TODO: implement Reddit API posting
  console.info("[distribution] Reddit post stub", { url: payload.url });
  return { platform: "reddit", status: "skipped", message: "Reddit API not configured" };
}

async function postToTwitter(payload: DistributionPayload): Promise<DistributionResult> {
  // TODO: implement X/Twitter API v2 posting
  console.info("[distribution] Twitter post stub", { url: payload.url });
  return { platform: "twitter", status: "skipped", message: "Twitter API not configured" };
}

export async function distributeContent(payload: DistributionPayload): Promise<DistributionResult[]> {
  const config = await getDistributionConfig();
  const tasks: Promise<DistributionResult>[] = [];

  if (config.facebook) tasks.push(postToFacebook(payload));
  if (config.linkedin) tasks.push(postToLinkedIn(payload));
  if (config.reddit) tasks.push(postToReddit(payload));
  if (config.twitter) tasks.push(postToTwitter(payload));

  if (tasks.length === 0) return [];

  const settled = await Promise.allSettled(tasks);
  return settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { platform: "facebook" as const, status: "error" as const, message: String((r as PromiseRejectedResult).reason) },
  );
}
