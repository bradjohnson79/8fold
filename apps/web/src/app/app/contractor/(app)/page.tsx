import { AppointmentCard } from "../AppointmentCard";
import { EstimatedCompletionCard } from "../EstimatedCompletionCard";

export default function ContractorDashboard() {
  return (
    <div className="space-y-6">
      <AppointmentCard />
      <EstimatedCompletionCard />
      <p className="text-gray-700">
        This is the contractor dashboard overview. Incentive progress and other tooling will be expanded next.
      </p>
    </div>
  );
}

