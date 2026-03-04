import { HeroBackgroundVideo } from "./HeroBackgroundVideo";
import { LocationSelector } from "@/components/LocationSelector";
import { HomeJobFeedClient } from "./HomeJobFeedClient";
import { HomepageFAQSection } from "@/components/home/HomepageFAQSection";

/**
 * Homepage is public. No auth or API calls in SSR.
 * All data loading happens client-side.
 */
export default function HomePage() {
  const heroVideoPath =
    String(process.env.NEXT_PUBLIC_HERO_VIDEO_PATH ?? "/hero-video.mp4").trim() || "/hero-video.mp4";
  const heroVideoEnabled =
    String(process.env.NEXT_PUBLIC_ENABLE_HERO_VIDEO ?? "").trim() === "1";

  return (
    <>
      <section className="relative overflow-hidden bg-8fold-navy min-h-[400px]">
        <HeroBackgroundVideo
          videoEnabled={heroVideoEnabled}
          videoPath={heroVideoPath}
          disabledReason={heroVideoEnabled ? null : "env not enabled"}
        />
        <div className="absolute inset-0 z-10 opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-72 h-72 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
        </div>
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
            Local Work.
            <br />
            <span className="text-8fold-green-light">Routed Right.</span>
          </h1>
          <p className="mt-6 text-lg text-gray-300 max-w-xl">
            8Fold serves across the United States and Canada — real jobs, real routing, real accountability.
          </p>
        </div>
      </section>

      <section className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <LocationSelector
            title="Find Jobs in Your Area"
            subtitle="Select your province or state, then choose a city/town. City lists only include locations with jobs."
          />
        </div>
      </section>

      <section className="py-16">
        <HomeJobFeedClient mode="guest_recent" isAuthenticated={false} />
      </section>

      <HomepageFAQSection />
    </>
  );
}
