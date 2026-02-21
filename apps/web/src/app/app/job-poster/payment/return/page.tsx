import { redirect } from "next/navigation";

export default function LegacyPaymentReturnPage() {
  redirect("/app/job-poster/payment/return-v2");
}
