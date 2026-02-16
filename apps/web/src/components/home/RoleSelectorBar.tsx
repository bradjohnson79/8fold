"use client";

import React from "react";

export type HomeRoleKey = "jobPoster" | "contractor" | "router";

export function RoleSelectorBar(props: {
  activeKey: HomeRoleKey;
  onSelect: (key: HomeRoleKey) => void;
}) {
  const items: Array<{ key: HomeRoleKey; label: string }> = [
    { key: "jobPoster", label: "Post a Job" },
    { key: "contractor", label: "Get Clients" },
    { key: "router", label: "Route & Earn" },
  ];

  return (
    <div className="w-full flex justify-center">
      <div className="inline-flex items-center gap-3 bg-white/80 backdrop-blur border border-gray-100 shadow-sm rounded-full p-2">
        {items.map((it) => {
          const active = it.key === props.activeKey;
          const base =
            "rounded-full px-5 py-2 text-sm sm:text-base font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1DBF73]";
          const cls = active
            ? `${base} bg-[#1DBF73] text-white`
            : `${base} bg-white text-[#1DBF73] border border-[#1DBF73] hover:bg-[#E9F9F1]`;
          return (
            <button key={it.key} type="button" className={cls} onClick={() => props.onSelect(it.key)}>
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

