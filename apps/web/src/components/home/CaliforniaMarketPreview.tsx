"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CityKey =
  | "Los Angeles"
  | "San Diego"
  | "San Jose"
  | "San Francisco"
  | "Sacramento";

type PreviewJob = {
  title: string;
  budget: string;
  category: string;
  city: CityKey;
};

const CITY_OPTIONS: CityKey[] = [
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Sacramento",
];

const JOBS_BY_CITY: Record<CityKey, PreviewJob[]> = {
  "Los Angeles": [
    { title: "Kitchen Sink Replacement", budget: "$450-$700", category: "Plumbing", city: "Los Angeles" },
    { title: "Electrical Panel Tune-Up", budget: "$900-$1,400", category: "Electrical", city: "Los Angeles" },
    { title: "Drywall Repair and Paint", budget: "$600-$950", category: "Drywall", city: "Los Angeles" },
  ],
  "San Diego": [
    { title: "Fence Gate Rebuild", budget: "$700-$1,100", category: "Carpentry", city: "San Diego" },
    { title: "Mini-Split Service Visit", budget: "$300-$520", category: "HVAC", city: "San Diego" },
    { title: "Bathroom Tile Refresh", budget: "$1,200-$1,900", category: "Tile", city: "San Diego" },
  ],
  "San Jose": [
    { title: "Exterior Paint Touch-Up", budget: "$850-$1,300", category: "Painting", city: "San Jose" },
    { title: "Water Heater Swap", budget: "$1,100-$1,700", category: "Plumbing", city: "San Jose" },
    { title: "Garage Door Sensor Repair", budget: "$250-$420", category: "Handyman", city: "San Jose" },
  ],
  "San Francisco": [
    { title: "Apartment Lighting Upgrade", budget: "$500-$880", category: "Electrical", city: "San Francisco" },
    { title: "Deck Board Replacement", budget: "$1,400-$2,100", category: "Carpentry", city: "San Francisco" },
    { title: "Window Trim Sealing", budget: "$350-$640", category: "Handyman", city: "San Francisco" },
  ],
  Sacramento: [
    { title: "Roof Leak Inspection", budget: "$650-$1,050", category: "Roofing", city: "Sacramento" },
    { title: "Landscape Irrigation Repair", budget: "$400-$780", category: "Landscaping", city: "Sacramento" },
    { title: "Interior Door Installation", budget: "$300-$560", category: "Carpentry", city: "Sacramento" },
  ],
};

export function CaliforniaMarketPreview() {
  const [selectedCity, setSelectedCity] = useState<CityKey>("Los Angeles");

  const jobs = useMemo(() => JOBS_BY_CITY[selectedCity], [selectedCity]);

  return (
    <section className="bg-gray-50 py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center rounded-full bg-8fold-green/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-8fold-green mb-4">
            California Only
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Live Market Preview
          </h2>
          <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
            Preview the kinds of jobs 8Fold is organizing across California right now.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          {CITY_OPTIONS.map((city) => {
            const active = city === selectedCity;
            return (
              <button
                key={city}
                type="button"
                onClick={() => setSelectedCity(city)}
                className={
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
                  (active
                    ? "bg-8fold-green text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-8fold-green/50 hover:text-8fold-green")
                }
              >
                {city}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <div
              key={`${job.city}-${job.title}`}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
            >
              <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-600">
                {job.category}
              </div>
              <h3 className="mt-4 text-xl font-bold text-gray-900">{job.title}</h3>
              <p className="mt-3 text-sm text-gray-500">
                Budget Range
              </p>
              <p className="text-lg font-bold text-8fold-green">{job.budget}</p>
              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="text-gray-500">City</span>
                <span className="font-semibold text-gray-900">{job.city}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/20"
          >
            View Available Jobs →
          </Link>
        </div>
      </div>
    </section>
  );
}
