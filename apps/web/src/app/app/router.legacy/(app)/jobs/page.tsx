export default function RouterJobsPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Jobs (placeholder)</h2>
      <p className="text-gray-600 mt-2">
        This area will show jobs you can claim and route. Data will be fetched only through web-owned routes under{" "}
        <span className="font-mono">/api/app/router/*</span>.
      </p>
      <div className="mt-6">
        <a href="/api/app/router/active-job" className="text-8fold-green hover:text-8fold-green-dark font-semibold">
          View router-only active job JSON →
        </a>
      </div>
    </>
  );
}

