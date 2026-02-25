"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

type AuthMenuProps = {
  textClassName?: string;
};

export function AuthMenu({ textClassName = "text-gray-200" }: AuthMenuProps) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return null;

  if (!user) {
    return (
      <Link href="/choose-role" className={`text-sm ${textClassName}`}>
        Sign Up
      </Link>
    );
  }

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.primaryEmailAddress?.emailAddress ||
    "Account";

  return (
    <div className="flex items-center gap-3">
      <span className={`max-w-[220px] truncate text-sm font-medium ${textClassName}`}>{fullName}</span>
      <UserButton afterSignOutUrl="/">
        <UserButton.MenuItems>
          <UserButton.Link label="Dashboard" labelIcon={<span />} href="/dashboard" />
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}
