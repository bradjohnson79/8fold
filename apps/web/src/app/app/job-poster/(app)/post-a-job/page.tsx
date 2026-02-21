import { redirect } from "next/navigation";
import { WizardV3 } from "../post-a-job-v3/WizardV3";

export default function JobPosterPostAJobPage() {
  const version = (process.env.NEXT_PUBLIC_JOB_POST_VERSION ?? process.env.JOB_POST_VERSION ?? "v3").toLowerCase();
  if (version === "v3") {
    redirect("/app/job-poster/post-a-job-v3");
  }
  return (
    <div className="max-w-4xl mx-auto">
      <WizardV3 />
    </div>
  );
}

