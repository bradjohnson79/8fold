import { redirect } from "next/navigation";

export default function LegacyPostAJobPage() {
  redirect("/app/job-poster/post-a-job-v2");
}

