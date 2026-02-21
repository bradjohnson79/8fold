import { notFound } from "next/navigation";
import { WizardV2 } from "@/app/app/job-poster/(app)/post-a-job-v2/WizardV2";

export default function JobWizardE2EPage() {
  if (String(process.env.E2E_TEST_MODE ?? "0").trim() !== "1") {
    notFound();
  }
  return (
    <main className="max-w-3xl mx-auto">
      <WizardV2 />
    </main>
  );
}
