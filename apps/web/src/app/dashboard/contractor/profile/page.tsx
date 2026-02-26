"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

/** Slim profile view — redirect to /contractor/setup for edits per plan. */
export default function ContractorProfilePage() {
  const [profile, setProfile] = useState<{
    firstName?: string | null;
    lastName?: string | null;
    contactName?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    tradeCategories?: string[];
    serviceRadiusKm?: number;
    stripeConnected?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/v4/contractor/profile", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { profile?: typeof profile };
          setProfile(data.profile ?? null);
        }
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-1 text-gray-600">View your contractor profile.</p>

      <div className="mt-6 max-w-xl space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Name</p>
          <p className="font-medium">
            {profile?.contactName ||
              [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() ||
              "—"}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Business Name</p>
          <p className="font-medium">{profile?.businessName ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Phone</p>
          <p className="font-medium">{profile?.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Email</p>
          <p className="font-medium">{profile?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Trade Categories</p>
          <p className="font-medium">
            {Array.isArray(profile?.tradeCategories) && profile.tradeCategories.length > 0
              ? profile.tradeCategories.join(", ")
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Service Radius (km)</p>
          <p className="font-medium">{profile?.serviceRadiusKm ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Stripe Connected</p>
          <p className="font-medium">{profile?.stripeConnected ? "Yes" : "No"}</p>
        </div>
      </div>

      <Link
        href="/contractor/setup"
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
      >
        Edit Profile
      </Link>
    </div>
  );
}
