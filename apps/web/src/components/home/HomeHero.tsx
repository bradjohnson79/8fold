"use client";

import React from "react";
import { RoleSelectorBar, type HomeRoleKey } from "./RoleSelectorBar";
import { HeroSlider } from "./HeroSlider";
import { TrustStrip } from "./TrustStrip";

const ROLE_TO_SLIDE: Record<HomeRoleKey, number> = {
  jobPoster: 0,
  contractor: 1,
  router: 2,
};

export function HomeHero() {
  const [activeIndex, setActiveIndex] = React.useState(0);

  return (
    <section>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <RoleSelectorBar
          activeKey={activeIndex === 0 ? "jobPoster" : activeIndex === 1 ? "contractor" : "router"}
          onSelect={(key) => setActiveIndex(ROLE_TO_SLIDE[key])}
        />
      </div>

      <HeroSlider activeIndex={activeIndex} onChangeIndex={setActiveIndex} />
      <TrustStrip />
    </section>
  );
}

