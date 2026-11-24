"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CommandPalette } from "./CommandPalette";

const NAV = [
  { href: "/", label: "Watch" },
  { href: "/collections", label: "Collections" },
  { href: "/upload", label: "Upload" },
];

/** The brand mark: a play triangle in a sage frame. */
export function BrandMark() {
  return (
    <span aria-hidden="true" className="relative inline-block h-[18px] w-[18px] rounded border-2 border-sage">
      <span className="absolute top-[3px] left-[4px] h-0 w-0 border-y-4 border-l-[6px] border-y-transparent border-l-sage" />
    </span>
  );
}

/** One bar, three text links and search. No hamburger, no sidebar. */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();

  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95">
      <div className="wrap flex h-[60px] items-center gap-4 md:gap-7">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-[650] tracking-[-0.02em]">
          <BrandMark />
          RyuZCloud
        </Link>
        <nav aria-label="Main" className="hidden gap-[22px] text-[15px] text-muted md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="transition-colors duration-150 hover:text-text aria-[current=page]:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1" />
        <CommandPalette />
        {status === "loading" ? (
          <span className="h-[34px] w-20 rounded-lg bg-s1" aria-hidden="true" />
        ) : user ? (
          <div className="flex items-center gap-2">
            <Link href="/studio" className="hidden h-[34px] items-center rounded-lg px-3 text-sm text-muted hover:text-text sm:flex">
              Your videos
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              className="h-[34px] rounded-lg border border-line-strong px-3.5 text-sm font-[550] hover:bg-s1"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="flex h-[34px] items-center rounded-lg border border-line-strong px-3.5 text-sm font-[550] hover:bg-s1">
            Sign in
          </Link>
        )}
      </div>
      {/* Small screens: the three links move under the bar instead of into a drawer. */}
      <nav aria-label="Main (compact)" className="wrap flex gap-5 pb-2.5 text-sm text-muted md:hidden">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined} className="aria-[current=page]:text-text">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
