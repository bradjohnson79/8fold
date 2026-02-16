import { JobsClient } from "./JobsClient";
import { requireServerSession } from "@/server/auth/requireServerSession";

export default async function JobsPage() {
  let session;
  try {
    session = await requireServerSession();
  } catch {
    session = null;
  }
  const isRouter = String(session?.role ?? "").trim().toUpperCase() === "ROUTER";
  return <JobsClient isRouter={isRouter} />;
}