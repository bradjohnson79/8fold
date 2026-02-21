const version = (process.env.NEXT_PUBLIC_JOB_POST_VERSION ?? process.env.JOB_POST_VERSION ?? "v3").toLowerCase();

export const postAJobPath = version === "v3" ? "/app/job-poster/post-a-job-v3" : "/app/job-poster/post-a-job";
