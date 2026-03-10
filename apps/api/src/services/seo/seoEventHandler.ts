import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import type { DomainEvent } from "@/src/events/domainEventTypes";
import { enqueueJobIndexing } from "./seoIndexingService";

/**
 * Dedicated SEO event handler — separate from notificationEventMapper.
 * Wired into processEventOutbox.ts alongside (not inside) the notification mapper.
 *
 * Handles job lifecycle events to drive IndexNow queue submissions.
 */
export async function seoEventHandler(event: DomainEvent): Promise<void> {
  switch (event.type) {
    case "JOB_PUBLISHED": {
      // JOB_PUBLISHED payload has no location fields — look up the job
      const [job] = await db
        .select({
          country_code: jobs.country_code,
          state_code: jobs.state_code,
          region_code: jobs.region_code,
          city: jobs.city,
          service_type: jobs.service_type,
          trade_category: jobs.trade_category,
        })
        .from(jobs)
        .where(eq(jobs.id, event.payload.jobId))
        .limit(1);
      if (job) await enqueueJobIndexing(job, "CREATE");
      break;
    }

    case "JOB_UPDATED":
      await enqueueJobIndexing(
        {
          country_code: event.payload.country_code,
          state_code: event.payload.state_code,
          region_code: event.payload.region_code,
          city: event.payload.city,
          service_type: event.payload.service_type,
          trade_category: event.payload.trade_category,
        },
        "UPDATE",
      );
      break;

    case "JOB_ARCHIVED":
      await enqueueJobIndexing(
        {
          country_code: event.payload.country_code,
          state_code: event.payload.state_code,
          region_code: event.payload.region_code,
          city: event.payload.city,
          service_type: event.payload.service_type,
          trade_category: event.payload.trade_category,
        },
        "DELETE",
      );
      break;

    case "JOB_DELETED":
      await enqueueJobIndexing(
        {
          country_code: event.payload.country_code,
          state_code: event.payload.state_code,
          region_code: event.payload.region_code,
          city: event.payload.city,
          service_type: event.payload.service_type,
          trade_category: event.payload.trade_category,
        },
        "DELETE",
      );
      break;

    default:
      // Not an SEO-relevant event — no-op
      break;
  }
}
