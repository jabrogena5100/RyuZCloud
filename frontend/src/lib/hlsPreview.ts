/**
 * Muted, low-bitrate HLS previews for the hero and hover cards. Previews never carry sound:
 * the element is muted here and never unmuted anywhere.
 */

/** True when the viewer asked for less motion or less data; previews are skipped then. */
export function previewsAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

function isCrossOrigin(src: string): boolean {
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Starts a muted preview of an HLS playlist on the element, at the lowest rendition.
 * Returns a function that stops it and releases the network. Errors are swallowed: a preview
 * that cannot play simply leaves the poster in place.
 */
export async function startPreview(video: HTMLVideoElement, src: string): Promise<() => void> {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  const crossOrigin = isCrossOrigin(src);

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    if (crossOrigin) {
      video.crossOrigin = "use-credentials";
    }
    video.src = src;
    await video.play().catch(() => undefined);
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }

  const { default: Hls } = await import("hls.js");
  if (!Hls.isSupported()) {
    return () => undefined;
  }
  const hls = new Hls({
    startLevel: 0,
    capLevelToPlayerSize: true,
    maxBufferLength: 8,
    ...(crossOrigin
      ? {
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.withCredentials = true;
          },
        }
      : {}),
  });
  hls.loadSource(src);
  hls.attachMedia(video);
  await video.play().catch(() => undefined);
  return () => {
    video.pause();
    hls.destroy();
  };
}
