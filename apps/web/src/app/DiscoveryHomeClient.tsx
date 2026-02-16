"use client";

import React from "react";
import { useRouter } from "next/navigation";

type RegionWithJobs = {
  country: "US" | "CA";
  regionCode: string;
  regionName: string;
  jobCount: number;
};

type CityWithJobs = {
  city: string;
  jobCount: number;
};

function slugCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

export function DiscoveryHomeClient() {
  const router = useRouter();

  const [regions, setRegions] = React.useState<RegionWithJobs[]>([]);
  const [cities, setCities] = React.useState<CityWithJobs[]>([]);

  const [regionKey, setRegionKey] = React.useState<string>("");
  const [city, setCity] = React.useState<string>("");

  const [loadingRegions, setLoadingRegions] = React.useState(true);
  const [loadingCities, setLoadingCities] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const selectedRegion = React.useMemo(() => {
    if (!regionKey) return null;
    const [country, regionCode] = regionKey.split(":");
    return regions.find((r) => r.country === country && r.regionCode === regionCode) ?? null;
  }, [regionKey, regions]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadRegions() {
      setLoadingRegions(true);
      setError("");
      try {
        const resp = await fetch("/api/public/locations/regions-with-jobs", { cache: "no-store" });
        if (!resp.ok) {
          // Don't assume JSON on failures.
          throw new Error("Failed to load regions");
        }
        const data = (await resp.json().catch(() => null)) as any;
        const list = Array.isArray(data) ? (data as RegionWithJobs[]) : Array.isArray(data?.regions) ? (data.regions as RegionWithJobs[]) : [];
        // Sort deterministically: USA first (alphabetical), then Canada (alphabetical).
        list.sort((a, b) => {
          if (a.country === b.country) return a.regionName.localeCompare(b.regionName, undefined, { sensitivity: "base" });
          if (a.country === "US") return -1;
          if (b.country === "US") return 1;
          // non-US (e.g., CA) fallback
          return a.regionName.localeCompare(b.regionName, undefined, { sensitivity: "base" });
        });
        if (cancelled) return;
        setRegions(list);

        // Auto-select if only one region exists
        if (list.length === 1) {
          const only = list[0]!;
          setRegionKey(`${only.country}:${only.regionCode}`);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load regions");
      } finally {
        if (!cancelled) setLoadingRegions(false);
      }
    }
    void loadRegions();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadCities() {
      setCities([]);
      setCity("");
      if (!selectedRegion) return;

      setLoadingCities(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          country: selectedRegion.country,
          regionCode: selectedRegion.regionCode
        });
        const resp = await fetch(`/api/public/locations/cities-with-jobs?${qs.toString()}`, { cache: "no-store" });
        if (!resp.ok) {
          // Don't assume JSON on failures.
          throw new Error("Failed to load cities");
        }
        const data = (await resp.json().catch(() => null)) as any;
        const list = Array.isArray(data) ? (data as CityWithJobs[]) : Array.isArray(data?.cities) ? (data.cities as CityWithJobs[]) : [];
        // Only keep cities with jobs (API ensures this) and sort case-insensitively.
        list.sort((x, y) => x.city.localeCompare(y.city, undefined, { sensitivity: "base" }));
        if (cancelled) return;
        setCities(list);

        // Auto-select if only one city exists
        if (list.length === 1) {
          setCity(list[0]!.city);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load cities");
      } finally {
        if (!cancelled) setLoadingCities(false);
      }
    }
    void loadCities();
    return () => {
      cancelled = true;
    };
  }, [selectedRegion?.country, selectedRegion?.regionCode]);

  const canGo = Boolean(selectedRegion && city);

  return (
    <div className="mb-10 rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-gray-500">Discover jobs in your area</div>
        <div className="text-2xl font-bold text-gray-900">Pick a location to view real + in-progress jobs</div>
        <div className="text-gray-600">
          We only show locations where jobs exist.
        </div>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">State / Province</div>
          <select
            value={regionKey}
            onChange={(e) => setRegionKey(e.target.value)}
            disabled={loadingRegions || regions.length === 0}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">{loadingRegions ? "Loading..." : "Select a region"}</option>
            {regions.map((r) => (
              <option key={`${r.country}:${r.regionCode}`} value={`${r.country}:${r.regionCode}`}>
                {r.regionName} ({r.country}) · {r.jobCount}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">City / Town</div>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!selectedRegion || loadingCities || cities.length === 0}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">
              {!selectedRegion ? "Select a region first" : loadingCities ? "Loading..." : "Select a city"}
            </option>
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city} · {c.jobCount}
              </option>
            ))}
          </select>
        </div>

        <div className="flex">
          <button
            disabled={!canGo}
            onClick={() => {
              if (!selectedRegion || !city) return;
              // Never navigate to an empty page: we only allow cities returned by the API.
              const exists = cities.some((c) => c.city === city);
              if (!exists) return;
              router.push(`/jobs/${selectedRegion.country}/${selectedRegion.regionCode}/${slugCity(city)}`);
            }}
            className={`w-full font-semibold px-4 py-2 rounded-lg transition-colors ${
              canGo ? "bg-8fold-green hover:bg-8fold-green-dark text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            View jobs
          </button>
        </div>
      </div>
    </div>
  );
}

