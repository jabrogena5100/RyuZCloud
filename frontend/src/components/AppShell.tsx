"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

/** Sign-in and sign-up are full-screen split layouts with their own brand header. */
const BARE_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-sage focus:px-3 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-[72px] border-t border-line py-7 text-sm text-muted">
        <div className="wrap flex flex-wrap items-center gap-x-7 gap-y-3">
          <span className="tnum rounded border border-amber/40 px-1.5 py-0.5 text-[11px] tracking-[0.1em] text-amber">DEMO</span>
          <span>A portfolio project. Titles are invented; clips are CC0, public domain, Pexels or Pixabay licensed.</span>
          <Link href="/credits" className="text-sage hover:text-sage-hover">
            Credits
          </Link>
        </div>
      </footer>
    </div>
  );
}
