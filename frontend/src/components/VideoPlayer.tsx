"use client";

import { useEffect, useRef, useState } from "react";

type VideoPlayerProps = {
  /** URL of the HLS master playlist (served by the API with the viewer's session cookie). */
  src: string;
  poster?: string | null;
  title: string;
};

/** True when src is on another origin (the CDN host), where cookies need explicit opt-in. */
function isCrossOrigin(src: string): boolean {
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * HLS player. hls.js (loaded only here, so it stays out of every other page's bundle) is used
 * wherever Media Source Extensions exist, so every browser gets the same adaptive-bitrate logic.
 * Native HLS is the fallback for browsers without MSE (older iOS). Chrome 14x+ also plays HLS
 * natively, so checking canPlayType first would silently hand Chrome its own player instead
 * (measured in docs/metrics.md, row P3). The playlist and
 * segment requests are same-origin locally, so the session cookie authorizes private media.
 * In AWS the playlist lives on the CDN host (a sibling subdomain); the API sets signed
 * CloudFront cookies when it returns the video, and requests to the CDN must send them.
 */
export function VideoPlayer({ src, poster, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setError(null);

    const crossOrigin = isCrossOrigin(src);
    let cancelled = false;
    let destroy: (() => void) | undefined;

    const playNatively = () => {
      if (crossOrigin) {
        video.crossOrigin = "use-credentials";
      }
      video.src = src;
      destroy = () => {
        video.removeAttribute("src");
        video.load();
      };
    };

    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) {
          return;
        }
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            playNatively();
          } else {
            setError("This browser can't play streaming video.");
          }
          return;
        }
        const hls = new Hls(
          crossOrigin
            ? {
                xhrSetup: (xhr: XMLHttpRequest) => {
                  xhr.withCredentials = true;
                },
                fetchSetup: (context: { url: string }, init: RequestInit) =>
                  new Request(context.url, { ...init, credentials: "include" }),
              }
            : {},
        );
        destroy = () => hls.destroy();
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError("The video couldn't be loaded. Try refreshing the page.");
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          playNatively();
        } else {
          setError("The video player couldn't be loaded.");
        }
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src]);

  return (
    <div className="flex flex-col">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={poster ?? undefined}
        aria-label={title}
        className="block aspect-video w-full bg-black"
      />
      {error && (
        <p role="alert" className="border-t border-danger/40 bg-s1 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
