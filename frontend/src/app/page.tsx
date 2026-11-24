"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Hero } from "@/components/Hero";
import { Shelf } from "@/components/Shelf";
import { StatsBand } from "@/components/StatsBand";
import { Thumb } from "@/components/Thumb";
import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import { formatClips, formatDuration, formatRelativeTime } from "@/lib/format";
import type { Collection, LibraryStats, Video } from "@/lib/types";
import { toVideoCardData } from "@/lib/videos";

type Row = { collection: Collection; videos: Video[] };

type HomeData = {
  featured: Video | null;
  stats: LibraryStats | null;
  rows: Row[];
  latest: Video[];
};

const ROWS_ON_HOME = 4;

/** Runs a request, turning both a rejection and a thrown error into null. */
async function maybe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

async function loadHome(): Promise<HomeData> {
  const [featured, stats, collections, latest] = await Promise.all([
    maybe(() => api.featuredVideo()),
    maybe(() => api.stats()),
    maybe(() => api.collections()),
    maybe(() => api.listVideos({ limit: 12 })),
  ]);
  const withVideos = (collections?.items ?? []).filter((c) => c.video_count > 0).slice(0, ROWS_ON_HOME);
  const pages = await Promise.all(withVideos.map((c) => maybe(() => api.collection(c.slug, { limit: 10 }))));
  return {
    featured,
    stats,
    rows: withVideos.flatMap((collection, i) => (pages[i]?.items.length ? [{ collection, videos: pages[i]!.items }] : [])),
    latest: latest?.items ?? [],
  };
}

const rowMeta = (c: Collection) => `${formatClips(c.video_count)} · ${Math.round(c.total_seconds / 60)} min`;

/** Editorial split: one large clip beside a numbered list of the next four. */
function SplitRow({ row }: { row: Row }) {
  const [lead, ...rest] = row.videos;
  return (
    <section aria-labelledby={`row-${row.collection.slug}`} className="mt-14">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={`row-${row.collection.slug}`} className="text-[22px] font-semibold tracking-[-0.02em]">
          {row.collection.title}
        </h2>
        <span className="tnum text-[13px] text-subtle">{rowMeta(row.collection)}</span>
        <Link href={`/collections/${row.collection.slug}`} className="ml-auto text-sm text-sage hover:text-sage-hover">
          View all<span className="sr-only">: {row.collection.title}</span>
        </Link>
      </div>
      <div className="grid gap-7 lg:grid-cols-[1.4fr_1fr]">
        <VideoCard video={toVideoCardData(lead)} lead />
        <ol className="flex flex-col">
          {rest.slice(0, 4).map((video, i) => (
            <li key={video.id} className="border-b border-line">
              <Link href={`/watch/${video.id}`} className="grid grid-cols-[34px_132px_1fr] items-center gap-3.5 py-2.5">
                <span className="tnum text-sm text-subtle" aria-hidden="true">
                  {String(i + 2).padStart(2, "0")}
                </span>
                <Thumb src={video.thumbnail_url} className="rounded-md" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-[550]">{video.title}</span>
                  {video.duration_seconds !== null && (
                    <span className="tnum text-[13px] text-muted">{formatDuration(video.duration_seconds)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-[min(76vh,720px)] min-h-[460px] border-b border-line bg-s1" />
      <div className="wrap mt-14 grid grid-cols-2 gap-[18px] md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-video rounded-[var(--radius-card)] bg-s1" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadHome().then((next) => !cancelled && setData(next));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <HomeSkeleton />;
  }

  const empty = !data.featured && data.latest.length === 0;

  return (
    <>
      {data.featured ? (
        <Hero video={data.featured} />
      ) : (
        <section className="border-b border-line">
          <div className="wrap py-20">
            <p className="eyebrow">Demo video platform</p>
            <h1 className="mt-3.5 max-w-[18ch] text-[clamp(36px,5vw,64px)] leading-[1] font-[650] tracking-[-0.035em]">
              Upload once. Every screen gets the right stream.
            </h1>
            <p className="mt-5 max-w-[52ch] text-[17px] text-muted">
              Nothing is published yet. Upload a clip: your browser sends it straight to object storage, and a worker turns it into
              adaptive HLS. Public clips show up here when they are ready.
            </p>
            <Link
              href="/upload"
              className="mt-7 inline-flex h-11 items-center rounded-lg bg-sage px-5 font-[550] text-bg transition-colors duration-150 hover:bg-sage-hover"
            >
              Upload a clip
            </Link>
          </div>
        </section>
      )}

      {data.stats && data.stats.videos > 0 && <StatsBand stats={data.stats} />}

      {!empty && (
        <div className="wrap">
          {data.rows.map((row, i) =>
            i === 1 && row.videos.length >= 3 ? (
              <SplitRow key={row.collection.slug} row={row} />
            ) : (
              <Shelf
                key={row.collection.slug}
                title={row.collection.title}
                meta={rowMeta(row.collection)}
                href={`/collections/${row.collection.slug}`}
                leadIndex={i === 0 ? 0 : undefined}
              >
                {row.videos.map((video, j) => (
                  <VideoCard
                    key={video.id}
                    video={toVideoCardData(video)}
                    ratio={i === 0 && j === 0 ? "2.39 / 1" : undefined}
                    lead={i === 0 && j === 0}
                  />
                ))}
              </Shelf>
            ),
          )}

          {data.latest.length > 0 && (
            <Shelf title="Just processed" meta="newest first, straight from the worker" href="/collections" linkLabel="Browse collections">
              {data.latest.map((video) => (
                <VideoCard
                  key={video.id}
                  video={toVideoCardData(video)}
                  meta={
                    <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-sage/45 px-2 py-px text-xs text-sage">
                      ✓ Ready{video.published_at && ` · ${formatRelativeTime(video.published_at)}`}
                    </span>
                  }
                />
              ))}
            </Shelf>
          )}
        </div>
      )}
    </>
  );
}
