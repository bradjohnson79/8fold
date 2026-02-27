import { getAdminJobDetail, listAdminJobs, parseJobsListParams } from "@/src/services/adminV4/jobsReadService";

export function parseJobsQuery(searchParams: URLSearchParams) {
  return parseJobsListParams(searchParams);
}

export async function list(params: ReturnType<typeof parseJobsListParams>) {
  return await listAdminJobs(params);
}

export async function getById(jobId: string) {
  return await getAdminJobDetail(jobId);
}

export const jobsRepo = {
  parseJobsQuery,
  list,
  getById,
};
