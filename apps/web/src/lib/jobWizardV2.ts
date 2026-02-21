/**
 * Feature flag for Job Post Wizard V2.
 * When true, sidebar and CTAs route to post-a-job-v2 instead of post-a-job.
 */
export const JOB_WIZARD_V2 =
  typeof process.env.NEXT_PUBLIC_JOB_WIZARD_V2 === "string"
    ? process.env.NEXT_PUBLIC_JOB_WIZARD_V2.toLowerCase() === "true"
    : false;

export const postAJobPath = JOB_WIZARD_V2 ? "/app/job-poster/post-a-job-v2" : "/app/job-poster/post-a-job";
