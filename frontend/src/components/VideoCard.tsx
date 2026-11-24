"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { previewsAllowed, startPreview } from "@/lib/hlsPreview";
import type { VideoCardData } from "@/lib/types";
import { Thumb } from "./Thumb";

/*
 * Adapted from "HoverPlayCard" by ruixen.ui on 21st.dev (https://21st.dev/@ruixen.ui/components/hover-play-card).
 * Kept: play a muted preview while the pointer is over the card, pause and reset on leave.
 * Changed: previews NEVER have sound (the click-to-unmute button is removed: clicking opens the
 * watch page); the preview also starts on keyboard focus; it waits 350 ms so sweeping the pointer
 * across a row does not start a dozen streams; it streams the lowest HLS rendition through hls.js
 * instead of an MP4; it is skipped on touch screens, under reduced motion and with Save-Data;
 * shadcn Button, lucide icons and framer-motion are replaced with plain elements and CSS
 * transitions (opacity only).
 */

const PREVIEW_DELAY_MS = 350;

type VideoCardProps = {
  video: VideoCardData;
  /** Thumbnail aspect ratio, e.g. "2.39 / 1" for a lead card. */
  ratio?: string;
  /** Larger title for lead cards. */
  lead?: boolean;
  /** Extra line under the title (status, rank ...). */
  meta?: React.ReactNode;
  priority?: boolean;
};

export function VideoCard({ video, ratio, lead = false, meta, priority = false }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const canPreview = Boolean(video.href);

  const stop = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopRef.current?.();
    stopRef.current = null;
    setPreviewing(false);
  };

  const begin = () => {
    if (!canPreview || timerRef.current || stopRef.current || !previewsAllowed()) {
      return;
    }
    if (typeof window.matchMedia === "function" && !window.matchMedia("(hover: hover)").matches) {
      return; // touch: the tap opens the video instead
    }
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try {
        // Fetching the video also grants the CloudFront cookies for its path on AWS.
        const full = await api.getVideo(video.id);
        const element = videoRef.current;
        if (!full.playback_url || !element) {
          return;
        }
        stopRef.current = await startPreview(element, full.playback_url);
        setPreviewing(true);
      } catch {
        // No preview; the thumbnail stays.
      }
    }, PREVIEW_DELAY_MS);
  };

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (
    <article className="group flex flex-col">
      <Thumb src={video.thumbnailUrl} durationSeconds={video.durationSeconds} ratio={ratio} priority={priority}>
        {canPreview && (
          <video
            ref={videoRef}
            muted
            playsInline
            aria-hidden="true"
            tabIndex={-1}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-[var(--ease-out-soft)] ${
              previewing ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] ring-1 ring-transparent transition-[box-shadow] duration-150 ring-inset group-hover:ring-line-strong"
        />
      </Thumb>
      <h3 className={`mt-2.5 line-clamp-2 font-[550] tracking-[-0.005em] ${lead ? "text-lg" : "text-[15px]"}`}>{video.title}</h3>
      <p className="tnum mt-0.5 truncate text-[13px] text-muted">
        <span>{video.channelName}</span>
        {video.collectionTitle && <span> · {video.collectionTitle}</span>}
      </p>
      {meta && <div className="mt-1.5">{meta}</div>}
    </article>
  );

  if (!video.href) {
    return body;
  }
  return (
    <Link
      href={video.href}
      onPointerEnter={begin}
      onPointerLeave={stop}
      onFocus={begin}
      onBlur={stop}
      className="block rounded-[var(--radius-card)] focus-visible:outline-offset-4"
    >
      {body}
    </Link>
  );
}
