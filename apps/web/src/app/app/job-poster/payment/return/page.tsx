import { redirect } from "next/navigation";

export default function LegacyPaymentReturnPage() {
  redirect("/app/job-poster/post-a-job-v3");
}
