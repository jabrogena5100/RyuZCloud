"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatClips } from "@/lib/format";
import type { LibraryStats } from "@/lib/types";
import { BrandMark } from "./TopBar";

/*
 * Adapted from "Split Login" (login-03) by Mohammad Shehadeh / Hirael on 21st.dev
 * (https://21st.dev/@mohammadshehadeh/components/login-03). Licence stated in its source: MIT.
 * Kept: the two-column layout (decorative aside beside a quiet form pane), a "back to home" link,
 * brand mark and a short line of copy anchored to the bottom of the aside, and the collapse to one
 * column on small screens.
 * Changed: the animated SVG paths become a tilted contact sheet of real thumbnails from the library
 * (static, so nothing moves); the quote becomes the pipeline in five pills; GitHub-only sign-in
 * becomes this app's email and password form with Sign in / Create account tabs; serif display
 * type, radial glows, motion and shadcn Button are removed; colours follow the design tokens.
 */

type AuthSplitProps = {
  mode: "login" | "register";
  title: string;
  hint: string;
  children: ReactNode;
  footer: ReactNode;
};

const FLOW = ["browser", "S3", "queue", "FFmpeg worker", "HLS · CloudFront"];
const MOBILE_TILES = 12;

export function AuthSplit({ mode, title, hint, children, footer }: AuthSplitProps) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listVideos({ limit: 20 })
      .then((page) => !cancelled && setThumbs(page.items.flatMap((v) => (v.thumbnail_url ? [v.thumbnail_url] : []))))
      .catch(() => undefined);
    api
      .stats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 20 tiles; real thumbnails where there are any, neutral frames for the rest.
  const tiles = Array.from({ length: 20 }, (_, i) => (thumbs.length ? thumbs[i % thumbs.length] : null));

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative h-[280px] overflow-hidden border-b border-line bg-[#0d0d0d] lg:h-auto lg:border-r lg:border-b-0">
        <div aria-hidden="true" className="absolute -inset-10 grid rotate-[-4deg] scale-[1.08] grid-cols-3 gap-2.5 opacity-55 lg:grid-cols-4">
          {tiles.map((src, i) => (
            // The 280 px band on small screens shows about 3 x 4 tiles; hidden tiles never fetch their lazy images.
            <div key={i} className={`aspect-video overflow-hidden rounded-md bg-s2 ${i >= MOBILE_TILES ? "max-lg:hidden" : ""}`}>
              {src && <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,#0d0d0d_8%,rgb(13_13_13/0.25)_60%,rgb(13_13_13/0.55))]" />
        <Link href="/" className="absolute top-7 left-[clamp(20px,5vw,64px)] z-10 flex items-center gap-2.5 text-lg font-[650] tracking-[-0.02em]">
          <BrandMark />
          RyuZCloud
          <span className="sr-only">: back to home</span>
        </Link>
        <div className="absolute right-[clamp(20px,5vw,64px)] bottom-[clamp(24px,6vh,64px)] left-[clamp(20px,5vw,64px)] z-10">
          {stats && stats.videos > 0 && (
            <p className="eyebrow">
              {formatClips(stats.videos)} · {(stats.total_seconds / 3600).toFixed(1)} h · all transcoded here
            </p>
          )}
          <p className="mt-2 mb-3 max-w-[16ch] text-[30px] leading-[1.03] font-[650] tracking-[-0.035em] lg:mt-3.5 lg:mb-4 lg:text-[clamp(30px,3.6vw,52px)]">
            Upload once. Every screen gets the right stream.
          </p>
          <ol aria-label="How a clip travels" className="tnum flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {FLOW.map((step, i) => (
              <li key={step} className={`flex items-center gap-2 ${i >= 3 ? "max-sm:hidden" : ""}`}>
                {i > 0 && (
                  <span aria-hidden="true" className="text-sage">
                    →
                  </span>
                )}
                <span className="rounded-full border border-line-strong bg-bg/70 px-2.5 py-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <main className="grid place-items-start justify-center px-5 py-8 sm:px-12 lg:place-items-center">
        <div className="w-[min(400px,100%)]">
          <nav aria-label="Account" className="mb-8 grid grid-cols-2 border-b border-line">
            {(
              [
                ["login", "/login", "Sign in"],
                ["register", "/register", "Create account"],
              ] as const
            ).map(([key, href, label]) => (
              <Link
                key={key}
                href={href}
                aria-current={mode === key ? "page" : undefined}
                className="-mb-px border-b-2 border-transparent py-3 text-center font-[550] text-muted hover:text-text aria-[current=page]:border-sage aria-[current=page]:text-text"
              >
                {label}
              </Link>
            ))}
          </nav>
          <h1 className="mb-1.5 text-[30px] font-[650] tracking-[-0.025em]">{title}</h1>
          <p className="mb-7 text-muted">{hint}</p>
          {children}
          <div className="mt-6 text-sm text-subtle">{footer}</div>
        </div>
      </main>
    </div>
  );
}
