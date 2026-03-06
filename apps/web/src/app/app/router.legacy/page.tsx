import { RouterCompletionCard } from "./RouterCompletionCard";

export default async function RouterPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Overview</h2>
      <p className="text-gray-600 mt-2">
        Use the routing tools to route open jobs in your region to eligible contractors.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/app/router/open-jobs" className="block border border-gray-200 rounded-2xl p-5 bg-white hover:bg-gray-50">
          <div className="font-bold text-gray-900">Open jobs in region</div>
          <div className="text-sm text-gray-600 mt-1">Select a job, then pick 1–5 contractors and route it.</div>
        </a>
        <a href="/app/router/queue" className="block border border-gray-200 rounded-2xl p-5 bg-white hover:bg-gray-50">
          <div className="font-bold text-gray-900">Routing queue</div>
          <div className="text-sm text-gray-600 mt-1">Track routed jobs, contractor counts, and time remaining.</div>
        </a>
      </div>

      <RouterCompletionCard />
    </>
  );
}

