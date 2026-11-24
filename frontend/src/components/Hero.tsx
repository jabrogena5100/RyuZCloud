"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { previewsAllowed, startPreview } from "@/lib/hlsPreview";
import type { Video } from "@/lib/types";

/*
 * Adapted from "PrismaHero" by rahil1202 on 21st.dev (https://21st.dev/@rahil1202/components/prisma-hero).
 * Kept: a full-bleed background video under the headline, a gradient for legibility, and the
 * word-by-word "pull up" reveal of the title.
 * Changed: the video is the featured clip's own HLS stream (lowest rendition, muted, never with
 * sound) and starts only after the page has loaded, never under reduced motion or Save-Data, so the
 * poster is the largest paint; the reveal is CSS (opacity/transform, 240 ms) instead of
 * framer-motion; the floating nav, noise layer and rounded frame are removed; the scrim is one-sided
 * so the image stays visible; colours and type follow the design tokens.
 */

function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          className="inline-block animate-[pull-up_240ms_var(--ease-out-soft)_both]"
          style={{ animationDelay: `${i * 60}ms`, marginRight: "0.22em" }}
        >
          {word}
        </span>
      ))}
    </>
  );
}

export function Hero({ video }: { video: Video }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!previewsAllowed()) {
      return;
    }
    let stop: (() => void) | null = null;
    let cancelled = false;
    const begin = async () => {
      try {
        const full = await api.getVideo(video.id); // grants the CloudFront cookies on AWS
        if (cancelled || !full.playback_url || !mediaRef.current) {
          return;
        }
        stop = await startPreview(mediaRef.current, full.playback_url);
        if (cancelled) {
          stop();
        } else {
          setPlaying(true);
        }
      } catch {
        // Poster only.
      }
    };
    const timer = setTimeout(() => void begin(), document.readyState === "complete" ? 800 : 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [video.id]);

  const facts = [video.collection?.title, video.duration_seconds !== null ? formatDuration(video.duration_seconds) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="hero-title" className="relative isolate h-[min(76vh,720px)] min-h-[460px] overflow-hidden border-b border-line">
      {video.thumbnail_url && (
        <img src={video.thumbnail_url} alt="" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      <video
        ref={mediaRef}
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        className={`absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-240 ease-[var(--ease-out-soft)] ${playing ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(20_20_20/0.92)_0%,rgb(20_20_20/0.55)_42%,rgb(20_20_20/0)_70%),linear-gradient(0deg,#141414_0%,rgb(20_20_20/0)_38%)] max-md:bg-[linear-gradient(0deg,#141414_8%,rgb(20_20_20/0.6)_55%,rgb(20_20_20/0.2))]"
      />
      {playing && (
        <span className="tnum absolute top-5 right-[clamp(16px,4vw,48px)] flex items-center gap-2 rounded-full border border-line bg-bg/70 px-2.5 py-1 text-xs text-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sage" />
          Preview · muted
        </span>
      )}
      <div className="wrap flex h-full flex-col items-start justify-end pb-[clamp(32px,7vh,72px)]">
        <p className="eyebrow">Featured{facts && ` · ${facts}`}</p>
        <h1 id="hero-title" className="mt-3.5 mb-4 max-w-[22ch] text-[clamp(38px,6vw,76px)] text-balance leading-[0.98] font-[650] tracking-[-0.035em]">
          <Words text={video.title} />
        </h1>
        {video.description && <p className="mb-6 line-clamp-3 max-w-[46ch] text-[17px] text-muted">{video.description}</p>}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/watch/${video.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-sage px-5 font-[550] text-bg transition-colors duration-150 hover:bg-sage-hover"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 4v16l14-8z" />
            </svg>
            Play
          </Link>
          {video.collection && (
            <Link
              href={`/collections/${video.collection.slug}`}
              className="inline-flex h-11 items-center rounded-lg border border-line-strong px-5 font-[550] transition-colors duration-150 hover:bg-s1"
            >
              Open {video.collection.title}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
