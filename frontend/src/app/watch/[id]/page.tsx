"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge, isInProgress } from "@/components/StatusBadge";
import { VideoCard } from "@/components/VideoCard";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ApiError, api, describeError } from "@/lib/api";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import { formatSeconds } from "@/lib/pipeline";
import type { Credit, Pipeline, Video } from "@/lib/types";
import { toVideoCardData } from "@/lib/videos";

const POLL_MS = 3000;

/*
 * At least one screen tall in every state, so the footer starts below the fold. Without it the
 * footer sat under the loading placeholder on phones and jumped twice, when the details and then
 * the pipeline panel arrived (mobile CLS 0.17, docs/metrics.md row P4).
 */
const PAGE = "min-h-[100svh]";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; video: Video };

/** Runs a request, turning both a rejection and a thrown error into null. */
async function maybe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

const CREDIT_LINK = "text-sage underline underline-offset-4 hover:text-sage-hover";

/** Footage credit: author, source page and licence, each linked when a URL exists. */
function CreditLine({ credit }: { credit: Credit }) {
  const link = (href: string | null, text: string) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={CREDIT_LINK}>
        {text}
      </a>
    ) : (
      text
    );
  return (
    <p className="mt-4 text-sm text-muted">
      Footage: {link(credit.author_url, credit.author)} on {link(credit.source_page_url, credit.source)} ·{" "}
      {link(credit.license_url, credit.license_name)} ·{" "}
      <Link href="/credits" className={CREDIT_LINK}>
        All credits
      </Link>
    </p>
  );
}

/** "How this video got here": the pipeline record of one ready video. */
function PipelinePanel({ pipeline }: { pipeline: Pipeline }) {
  const job = pipeline.job;
  const processing = job?.started_at && job.finished_at ? (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000 : null;
  const rows: [string, React.ReactNode][] = [];
  if (pipeline.upload) {
    rows.push(["Upload", `direct to storage · ${formatBytes(pipeline.upload.size_bytes)}`]);
  }
  if (pipeline.renditions.length) {
    rows.push([
      "Renditions",
      <span key="r" className="flex justify-end gap-1.5">
        {pipeline.renditions.map((r) => (
          <span key={r.name} className="rounded border border-line-strong px-1.5">
            {r.name}
          </span>
        ))}
      </span>,
    ]);
    const segments = pipeline.renditions.reduce((n, r) => n + r.segment_count, 0);
    rows.push(["Segments", `${segments} across ${pipeline.renditions.length} playlists`]);
    rows.push(["HLS size", formatBytes(pipeline.renditions.reduce((n, r) => n + r.size_bytes, 0))]);
  }
  if (processing !== null) {
    const ratio = pipeline.duration_seconds ? ` (${(processing / pipeline.duration_seconds).toFixed(2)}× length)` : "";
    rows.push(["Processing", `${formatSeconds(processing)}${ratio}`]);
  }
  if (job && job.attempts > 1) {
    rows.push(["Attempts", `${job.attempts}: recovered after a failed attempt`]);
  }
  if (rows.length === 0) {
    return null;
  }
  return (
    <aside aria-labelledby="how-heading" className="self-start rounded-[var(--radius-card)] border border-line bg-s1 p-5">
      <h2 id="how-heading" className="eyebrow mb-3.5">
        How this video got here
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-subtle">{label}</dt>
            <dd className="tnum text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-line pt-3.5 text-sm text-muted">
        The player picks a rendition for your screen and connection, and switches as bandwidth changes.
      </p>
    </aside>
  );
}

/** Watch page. A video that is still being processed shows live status instead of a player. */
export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [next, setNext] = useState<Video[]>([]);

  const status = state.kind === "loaded" ? state.video.status : null;
  const waiting = status !== null && isInProgress(status);
  const collectionSlug = state.kind === "loaded" ? state.video.collection?.slug : undefined;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .getVideo(id)
        .then((video) => !cancelled && setState({ kind: "loaded", video }))
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          if (error instanceof ApiError && error.status === 404) {
            setState({ kind: "missing" });
          } else {
            setState((current) => (current.kind === "loaded" ? current : { kind: "error", message: describeError(error) }));
          }
        });

    void load();
    const timer = waiting ? setInterval(() => void load(), POLL_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [id, waiting]);

  // Pipeline facts once the video is ready, and the rest of its collection.
  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    let cancelled = false;
    void maybe(() => api.pipeline(id)).then((p) => !cancelled && setPipeline(p));
    if (collectionSlug) {
      void maybe(() => api.collection(collectionSlug, { limit: 9 })).then(
        (page) => !cancelled && setNext((page?.items ?? []).filter((v) => v.id !== id).slice(0, 8)),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [id, status, collectionSlug]);

  if (state.kind === "loading") {
    return (
      <div className={PAGE}>
        <div className="border-b border-line bg-black">
          <div aria-busy="true" aria-label="Loading video" className="mx-auto aspect-video w-[min(100%,calc((100vh-124px)*16/9),1600px)] bg-s1" />
        </div>
      </div>
    );
  }
  if (state.kind === "missing" || state.kind === "error") {
    return (
      <div className="wrap max-w-md py-20 text-center">
        <h1 className="mb-2 text-2xl font-semibold">{state.kind === "missing" ? "Video not found" : "Couldn't load this video"}</h1>
        <p className="mb-5 text-muted">{state.kind === "missing" ? "It may be private, still processing, or deleted." : state.message}</p>
        <Link href="/" className="text-sage hover:text-sage-hover">
          Back to home
        </Link>
      </div>
    );
  }

  const { video } = state;
  return (
    <div className={PAGE}>
      <div className="border-b border-line bg-black">
        <div className="mx-auto w-[min(100%,calc((100vh-124px)*16/9),1600px)]">
          {video.status === "ready" && video.playback_url ? (
            <VideoPlayer src={video.playback_url} poster={video.thumbnail_url} title={video.title} />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-s1 p-6 text-center">
              <StatusBadge status={video.status} progress={video.processing_progress} />
              {video.status === "failed" ? (
                <p role="alert" className="max-w-md text-sm text-danger">
                  {video.processing_error ?? "This video couldn't be processed."}
                </p>
              ) : (
                <p className="max-w-md text-sm text-muted">
                  {video.status === "queued" && "Your video is in the queue. This page updates automatically."}
                  {video.status === "processing" && "Your video is being prepared for streaming. This page updates automatically."}
                  {(video.status === "draft" || video.status === "uploading") && "This video hasn't finished uploading."}
                </p>
              )}
              {typeof video.processing_progress === "number" && (video.status === "queued" || video.status === "processing") && (
                <div
                  role="progressbar"
                  aria-label="Processing progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={video.processing_progress}
                  className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-s2"
                >
                  <div className="h-full bg-amber transition-[width] duration-200" style={{ width: `${video.processing_progress}%` }} />
                </div>
              )}
              {isInProgress(video.status) && (
                <Link href="/studio" className="text-sm text-sage hover:text-sage-hover">
                  Follow it in your videos
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="wrap">
        <div className="grid gap-7 pt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="min-w-0">
            {video.collection && (
              <Link href={`/collections/${video.collection.slug}`} className="eyebrow hover:text-text">
                {video.collection.title}
              </Link>
            )}
            <h1 className="mt-2.5 mb-3 text-[clamp(26px,3vw,36px)] leading-[1.1] font-[650] tracking-[-0.025em]">{video.title}</h1>
            <p className="tnum flex flex-wrap gap-x-3.5 text-[15px] text-muted">
              <span className="text-sage">{video.channel.name}</span>
              {video.published_at && <span>published {formatRelativeTime(video.published_at)}</span>}
              {video.visibility !== "public" && <span>{video.visibility}</span>}
            </p>
            {video.description && <p className="mt-5 max-w-[70ch] whitespace-pre-wrap text-muted">{video.description}</p>}
            {video.credit && <CreditLine credit={video.credit} />}
          </div>
          {pipeline && <PipelinePanel pipeline={pipeline} />}
        </div>

        {next.length > 0 && video.collection && (
          <section aria-labelledby="next-heading" className="mt-14">
            <h2 id="next-heading" className="mb-4 text-xl font-semibold tracking-[-0.02em]">
              Next in {video.collection.title}
            </h2>
            <ul className="grid grid-cols-2 gap-[18px] lg:grid-cols-4">
              {next.slice(0, 4).map((v) => (
                <li key={v.id}>
                  <VideoCard video={toVideoCardData(v)} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
