"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JOB_POSTER_TOS_SECTIONS,
  JOB_POSTER_TOS_TITLE,
  JOB_POSTER_TOS_VERSION,
} from "@/lib/jobPosterTosV1";
import { REGION_OPTIONS } from "@/lib/regions";
import { OnboardingProgressBar } from "@/components/onboarding/OnboardingProgressBar";
import { z } from "zod";
import { MapLocationSelector } from "@/components/location/MapLocationSelector";

type Step = "terms" | "profile";
const JobPosterOnboardingPayloadSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).optional(),
  legalStreet: z.string().trim().min(1),
  legalCity: z.string().trim().min(1),
  legalProvince: z.string().trim().min(2),
  legalPostalCode: z.string().trim().min(3),
  legalCountry: z.enum(["CA", "US"]),
  mapDisplayName: z.string().trim().min(1),
  lat: z.number(),
  lng: z.number(),
});

export default function JobPosterOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("terms");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [stateProvince, setStateProvince] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [mapDisplayName, setMapDisplayName] = useState("");
  const [mapLat, setMapLat] = useState<number>(0);
  const [mapLng, setMapLng] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const regionOptions = REGION_OPTIONS[country] ?? [];

  const [status, setStatus] = useState<any | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await fetch("/api/app/onboarding/status", { cache: "no-store", credentials: "include" }).catch(() => null as any);
      const json = await resp?.json?.().catch(() => null);
      if (!alive) return;
      if (json && json.ok) {
        setStatus(json);
        // If terms already accepted, start on profile.
        if (json?.steps?.tos?.ok) setStep("profile");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function acceptTerms() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/tos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accepted: true, version: JOB_POSTER_TOS_VERSION }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Could not record acceptance");
      setTermsAccepted(true);
      setStep("profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record acceptance");
    } finally {
      setLoading(false);
    }
  }

  async function completeOnboarding() {
    const n = name.trim();
    const e = email.trim();
    const p = phone.trim();
    const a = address.trim();
    const sp = stateProvince.trim().toUpperCase();
    const c = city.trim();
    const pc = postalCode.trim();
    if (n.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (!e || !e.includes("@")) {
      setError("Email is required.");
      return;
    }
    if (p.length < 7) {
      setError("Phone number must be at least 7 characters.");
      return;
    }
    if (a.length < 3) {
      setError("Address is required.");
      return;
    }
    if (!sp || sp.length < 2 || !c) {
      setError("Country, state/province, and city are required.");
      return;
    }
    if (pc.length < 3) {
      setError("Postal / ZIP code is required.");
      return;
    }
    const geoSelected = Number.isFinite(mapLat) && Number.isFinite(mapLng) && mapLat !== 0 && mapLng !== 0;
    if (!mapDisplayName.trim() || !geoSelected) {
      setError("Please select your location from the map suggestions.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const legalStreet = a;
      const legalCity = c;
      const legalProvince = sp;
      const legalPostalCode = pc;
      const legalCountry = country;
      const payload = {
        name: n,
        email: e,
        phone: p || undefined,
        legalStreet,
        legalCity,
        legalProvince,
        legalPostalCode,
        legalCountry,
        mapDisplayName: mapDisplayName.trim(),
        lat: mapLat,
        lng: mapLng,
      };
      const parsedPayload = JobPosterOnboardingPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) throw new Error("Please complete all required fields, including map location.");

      const profileResp = await fetch("/api/app/job-poster/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsedPayload.data),
      });
      const profileJson = await profileResp.json().catch(() => ({}));
      if (!profileResp.ok) throw new Error(profileJson?.error || "Could not save profile");

      const completeResp = await fetch("/api/app/job-poster/complete-onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const completeJson = await completeResp.json().catch(() => ({}));
      if (!completeResp.ok) throw new Error(completeJson?.error || "Could not complete onboarding");

      router.replace("/app/job-poster");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete onboarding");
    } finally {
      setLoading(false);
    }
  }

  if (step === "terms") {
    return (
      <div className="min-h-[70vh]">
        <div className="max-w-3xl mx-auto p-6">
          {status?.steps ? (
            <div className="mb-6">
              <OnboardingProgressBar title="Job Poster onboarding" steps={status.steps} />
            </div>
          ) : null}
          <h1 className="text-xl font-bold text-gray-900">
            {JOB_POSTER_TOS_TITLE} (v{JOB_POSTER_TOS_VERSION})
          </h1>
          <p className="text-gray-600 mt-1">
            You must read and accept these terms before accessing the Job Poster dashboard.
          </p>

          <div
            onScroll={(e) => {
              const el = e.currentTarget;
              const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
              if (atEnd) setScrolledToEnd(true);
            }}
            className="max-h-[55vh] overflow-y-auto mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50"
          >
            {JOB_POSTER_TOS_SECTIONS.map((s) => (
              <section key={s.heading} className="mb-6">
                <div className="font-bold text-gray-900">{s.heading}</div>
                <ul className="mt-2 space-y-2 text-gray-700 text-sm list-disc list-inside">
                  {s.body.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {error ? (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
          ) : null}

          <div className="mt-6 flex items-start gap-3">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1"
              id="tos"
            />
            <label htmlFor="tos" className="text-gray-800">
              I have read and accept the Job Poster Terms & Conditions.
            </label>
          </div>

          <button
            onClick={() => void acceptTerms()}
            disabled={!termsAccepted || !scrolledToEnd || loading}
            className="mt-6 bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            {loading ? "Submitting…" : "Accept and continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh]">
      <div className="max-w-2xl mx-auto p-6">
        {status?.steps ? (
          <div className="mb-6">
            <OnboardingProgressBar title="Job Poster onboarding" steps={status.steps} />
          </div>
        ) : null}
        <h1 className="text-xl font-bold text-gray-900">Complete your profile</h1>
        <p className="text-gray-600 mt-1">
          Name, email, phone, and location are required to post jobs.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Country</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value as "US" | "CA");
                setStateProvince("");
              }}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">State / Province</label>
            <select
              value={stateProvince}
              onChange={(e) => setStateProvince(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select…</option>
              {regionOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Postal / ZIP</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="V2Y 0R2"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <MapLocationSelector
              required
              value={mapDisplayName}
              onChange={(data) => {
                setMapDisplayName(data.mapDisplayName);
                setMapLat(data.lat);
                setMapLng(data.lng);
              }}
              errorText={
                !Number.isFinite(mapLat) || !Number.isFinite(mapLng) || mapLat === 0 || mapLng === 0
                  ? "Please select your location from the map suggestions."
                  : ""
              }
            />
          </div>
        </div>

        {error ? (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        ) : null}

        <button
          onClick={() => void completeOnboarding()}
          disabled={
            name.trim().length < 2 ||
            !email.trim() ||
            phone.trim().length < 7 ||
            address.trim().length < 3 ||
            !stateProvince ||
            stateProvince.length < 2 ||
            !city.trim() ||
            postalCode.trim().length < 3 ||
            !mapDisplayName.trim() ||
            !Number.isFinite(mapLat) ||
            !Number.isFinite(mapLng) ||
            mapLat === 0 ||
            mapLng === 0 ||
            loading
          }
          className="mt-6 bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
        >
          {loading ? "Complete…" : "Complete onboarding"}
        </button>
      </div>
    </div>
  );
}
