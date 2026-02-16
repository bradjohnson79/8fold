"use client";

import { useEffect, useState } from "react";
import { JobCard } from "../../components/JobCard";
import { calculatePayoutBreakdown, REVENUE_SPLIT } from "@8fold/shared";

interface JobFromApi {
  id: string;
  title: string;
  scope: string;
  region: string;
  serviceType: string;
  tradeCategory?: string;
  timeWindow?: string;
  routerEarningsCents: number;
  brokerFeeCents?: number;
  contractorPayoutCents?: number;
  laborTotalCents?: number;
  materialsTotalCents?: number;
  transactionFeeCents?: number;
  publishedAt: string;
  status?: string;
}

interface JobsResponse {
  jobs: JobFromApi[];
}

export function JobsClient({ isRouter }: { isRouter: boolean }) {
  const [jobs, setJobs] = useState<
    Array<JobFromApi & { status: string; brokerFeeCents: number; contractorPayoutCents: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Same-origin call to our web proxy route (avoids CORS)
      const response = await fetch(`/api/jobs/feed`);

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      const data: JobsResponse = await response.json();

      // Ensure breakdown is present for display
      const jobsWithBreakdown = data.jobs.map((job) => {
        const status = job.status ?? "PUBLISHED";
        
        // If the API didn't provide the new fields (e.g. legacy jobs), 
        // we use the routerEarningsCents to back-calculate for a consistent UI.
        // Old model was roughly: Router 100, Broker 50, Contractor 150 (Total 300)
        // Router was 1/3 of total.
        // In the fixed split model, Router is 15.0%.
        
        if (job.laborTotalCents !== undefined) {
          const b = calculatePayoutBreakdown(job.laborTotalCents, job.materialsTotalCents ?? 0);
          return {
            ...job,
            status,
            brokerFeeCents: job.brokerFeeCents ?? b.platformFeeCents,
            contractorPayoutCents: job.contractorPayoutCents ?? b.contractorPayoutCents
          };
        }

        // Back-calculate for legacy jobs to show the fixed split model
        // We treat the current router earnings as the fixed router share of the new labor total.
        const estimatedLaborTotal = Math.round(job.routerEarningsCents / REVENUE_SPLIT.router);
        const b = calculatePayoutBreakdown(estimatedLaborTotal, 0);

        return {
          ...job,
          status,
          laborTotalCents: b.laborTotalCents,
          materialsTotalCents: b.materialsTotalCents,
          transactionFeeCents: b.transactionFeeCents,
          contractorPayoutCents: b.contractorPayoutCents,
          routerEarningsCents: b.routerEarningsCents,
          brokerFeeCents: b.platformFeeCents
        };
      });

      setJobs(jobsWithBreakdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-64 mb-4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-96 mb-6 animate-pulse"></div>
            <div className="flex space-x-4">
              <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
              >
                <div className="p-6">
                  <div className="h-6 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4 animate-pulse"></div>
                  <div className="h-48 bg-gray-200 rounded-xl mb-4 animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-12 bg-gray-200 rounded-lg mt-6 animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Available Jobs</h1>
          <p className="text-xl text-gray-600 mb-6">
            Route jobs for your home state/province. Claim one job at a time. Clear earnings shown upfront.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-6 flex-wrap">
            <button
              onClick={() => void fetchJobs()}
              className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
            >
              Refresh Jobs
            </button>
            {!isRouter ? (
              <a
                href="/signup"
                className="text-gray-600 hover:text-8fold-green font-medium transition-colors"
              >
                Sign up to start routing jobs →
              </a>
            ) : null}

            <div className="text-gray-600 font-medium">
              Local Postings Available in <span className="font-semibold text-gray-900">USA</span>{" "}
              <span className="font-semibold text-gray-900">&amp;</span>{" "}
              <span className="font-semibold text-gray-900">Canada</span>!
              <div className="text-8fold-green font-semibold">All 50 States &amp; 10 Provinces!</div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error ? (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          </div>
        ) : null}

        {/* Jobs Grid */}
        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} isAuthenticated={isRouter} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">💼</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">No jobs available right now</h3>
            <p className="text-gray-600 mb-6">
              Jobs will appear here when they become available for routing.
            </p>
            <button
              onClick={() => void fetchJobs()}
              className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
            >
              Refresh to check again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

