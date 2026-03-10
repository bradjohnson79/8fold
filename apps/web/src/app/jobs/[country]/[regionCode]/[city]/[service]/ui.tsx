"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LocationSelector } from "../../../../../../components/LocationSelector";
import { JobCard } from "../../../../../../components/JobCard";
import { slugify, tradeCategoryToSlug } from "@/utils/slug";

type Job = {
  id: string;
  title: string;
  tradeCategory: string;
  city: string | null;
  status: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  publishedAt?: string | null;
  imageUrl: string | null;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  brokerFeeCents: number;
  photos: Array<{ id: string; kind: string; url: string | null }>;
};

type DistinctService = { tradeCategory: string };

type NearbyCity = { city: string; jobCount: number; latestActivity?: string | null };

type Props = {
  country: string;
  regionCode: string;
  regionName: string;
  city: string;
  citySlug: string;
  serviceSlug: string;
  serviceTitle: string;
  jobs: Job[];
  page: number;
  totalJobs: number;
  totalPages: number;
  distinctServices: DistinctService[];
  nearbyCities: NearbyCity[];
};

function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <Link
        href={page === 1 ? basePath : page === 2 ? basePath : `${basePath}?page=${page - 1}`}
        className={`px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors ${page === 1 ? "pointer-events-none opacity-40" : ""}`}
      >
        ← Prev
      </Link>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm select-none">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={p === 1 ? basePath : `${basePath}?page=${p}`}
            className={`w-9 h-9 text-sm rounded-lg border transition-colors flex items-center justify-center ${
              page === p ? "bg-blue-600 border-blue-600 text-white font-bold" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={page >= totalPages ? basePath : `${basePath}?page=${page + 1}`}
        className={`px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
      >
        Next →
      </Link>
    </div>
  );
}

export function ServiceLocationJobsClient(props: Props) {
  const {
    country,
    regionCode,
    regionName,
    city,
    citySlug,
    serviceSlug,
    serviceTitle,
    jobs,
    page,
    totalJobs,
    totalPages,
    distinctServices,
    nearbyCities,
  } = props;

  const basePath = `/jobs/${country.toLowerCase()}/${regionCode.toLowerCase()}/${citySlug}/${serviceSlug}`;

  const otherServices = distinctServices.filter((s) => tradeCategoryToSlug(s.tradeCategory) !== serviceSlug);

  const breadcrumbItems = [
    { name: "Home", url: "https://8fold.app" },
    { name: "Jobs", url: "https://8fold.app/jobs" },
    { name: country === "US" ? "United States" : "Canada", url: `https://8fold.app/jobs/${country.toLowerCase()}` },
    { name: regionName, url: `https://8fold.app/jobs/${country.toLowerCase()}/${regionCode.toLowerCase()}` },
    { name: city, url: `https://8fold.app/jobs/${country.toLowerCase()}/${regionCode.toLowerCase()}/${citySlug}` },
    { name: `${serviceTitle} Jobs`, url: `https://8fold.app${basePath}` },
  ];

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems.map((item, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: item.name,
              item: item.url,
            })),
          }),
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocationSelector
          initialCountry={country.toUpperCase() === "CA" ? "CA" : "US"}
          initialRegionCode={regionCode}
          initialCity={city}
        />

        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-500">Jobs</div>
          <h1 className="text-3xl font-bold text-gray-900">
            {serviceTitle} Jobs in {city}, {regionCode}
          </h1>
          <p className="text-gray-600 mt-2">
            Browse the latest {serviceTitle.toLowerCase()} jobs posted in {city}. Contractors can find work in {city}{" "}
            and surrounding areas using the 8Fold marketplace.
          </p>
          <p className="text-gray-600 mt-1">
            If you&apos;re looking for {serviceTitle.toLowerCase()} work in {city}, explore the listings below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((j) => {
            const photo = j.imageUrl ?? j.photos?.find((p) => p.url)?.url ?? null;
            const regionSlug = `${citySlug}-${regionCode.toLowerCase()}`;

            return (
              <div key={j.id}>
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      "@context": "https://schema.org",
                      "@type": "JobPosting",
                      title: j.title,
                      datePosted: j.publishedAt ?? j.createdAt,
                      hiringOrganization: { name: "8Fold" },
                      jobLocation: {
                        addressLocality: j.city ?? city,
                        addressRegion: regionCode,
                        addressCountry: country,
                      },
                    }),
                  }}
                />
                <JobCard
                  job={{
                    id: j.id,
                    title: j.title ?? "Untitled",
                    region: regionSlug,
                    country: country as "US" | "CA",
                    currency: (country === "CA" ? "CAD" : "USD") as "USD" | "CAD",
                    isMock: false,
                    serviceType: serviceSlug,
                    tradeCategory: j.tradeCategory ?? "",
                    timeWindow: undefined,
                    amountCents: j.amountCents ?? 0,
                    routerEarningsCents: j.routerEarningsCents ?? 0,
                    brokerFeeCents: j.brokerFeeCents ?? 0,
                    contractorPayoutCents: j.contractorPayoutCents ?? 0,
                    laborTotalCents: j.amountCents ?? 0,
                    materialsTotalCents: 0,
                    transactionFeeCents: 0,
                    status: j.status ?? "PUBLISHED",
                    image: photo ?? undefined,
                  }}
                  isAuthenticated={false}
                />
              </div>
            );
          })}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath={basePath} />

        {otherServices.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Other Services in {city}</h2>
            <div className="flex flex-wrap gap-2">
              {otherServices.map((s) => {
                const slug = tradeCategoryToSlug(s.tradeCategory);
                const label = s.tradeCategory.replace(/_/g, " ");
                return (
                  <Link
                    key={s.tradeCategory}
                    href={`/jobs/${country.toLowerCase()}/${regionCode.toLowerCase()}/${citySlug}/${slug}`}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800 transition-colors"
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {nearbyCities.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nearby Cities</h2>
            <div className="flex flex-wrap gap-2">
              {nearbyCities
                .filter((c) => slugify(c.city) !== citySlug)
                .slice(0, 12)
                .map((c) => {
                  const slug = slugify(c.city);
                  return (
                    <Link
                      key={c.city}
                      href={`/jobs/${country.toLowerCase()}/${regionCode.toLowerCase()}/${slug}/${serviceSlug}`}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800 transition-colors"
                    >
                      {c.city}
                    </Link>
                  );
                })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
