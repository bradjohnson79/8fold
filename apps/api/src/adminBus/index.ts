import * as jobsRepo from "@/src/adminBus/repos/jobs.repo";
import * as usersRepo from "@/src/adminBus/repos/users.repo";
import * as jobPostersRepo from "@/src/adminBus/repos/jobPosters.repo";
import * as contractorsRepo from "@/src/adminBus/repos/contractors.repo";
import * as routersRepo from "@/src/adminBus/repos/routers.repo";
import * as invitesRepo from "@/src/adminBus/repos/invites.repo";
import * as userLifecycleRepo from "@/src/adminBus/repos/userLifecycle.repo";

export * from "@/src/adminBus/db";
export * from "@/src/adminBus/auth";
export * from "@/src/adminBus/schemaIntrospection";
export * from "@/src/adminBus/mappers/job.mapper";
export * from "@/src/adminBus/mappers/user.mapper";

export { jobsRepo, usersRepo, jobPostersRepo, contractorsRepo, routersRepo, invitesRepo, userLifecycleRepo };

export const adminRepos = {
  jobs: jobsRepo,
  users: usersRepo,
  jobPosters: jobPostersRepo,
  contractors: contractorsRepo,
  routers: routersRepo,
  invites: invitesRepo,
  userLifecycle: userLifecycleRepo,
};
