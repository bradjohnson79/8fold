export default function ContractorJobsPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Assigned Jobs (placeholder)</h2>
      <p className="text-gray-600 mt-2">
        This area will show jobs that have been routed to you. Access will be enforced server-side.
      </p>
      <div className="mt-6">
        <a href="/api/app/contractor/jobs" className="text-8fold-green hover:text-8fold-green-dark font-semibold">
          View contractor jobs JSON (placeholder) →
        </a>
      </div>
    </>
  );
}

