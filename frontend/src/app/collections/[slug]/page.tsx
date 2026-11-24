"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import type { CollectionPage, Video } from "@/lib/types";
import { toVideoCardData } from "@/lib/videos";

const PAGE_SIZE = 24;
type Sort = "curated" | "shortest" | "longest";

/** Mosaic rhythm: a wide lead, two small; two halves; then rows of three. */
function tileClass(i: number): string {
  if (i === 0) return "lg:col-span-4 lg:row-span-2";
  if (i === 3 || i === 4) return "lg:col-span-3";
  return "lg:col-span-2";
}

function sorted(videos: Video[], sort: Sort): Video[] {
  if (sort === "curated") return videos;
  const dur = (v: Video) => v.duration_seconds ?? 0;
  return [...videos].sort((a, b) => (sort === "shortest" ? dur(a) - dur(b) : dur(b) - dur(a)));
}

export default function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CollectionPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [sort, setSort] = useState<Sort>("curated");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .collection(slug, { limit: PAGE_SIZE })
      .then((res) => !cancelled && setPage(res))
      .catch(() => !cancelled && setMissing(true)); // 404 or unreachable: either way there is nothing to show
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function loadMore() {
    if (!page) return;
    setLoadingMore(true);
    try {
      const next = await api.collection(slug, { limit: PAGE_SIZE, offset: page.items.length });
      setPage({ ...page, items: [...page.items, ...next.items] });
    } finally {
      setLoadingMore(false);
    }
  }

  if (missing) {
    return (
      <div className="wrap py-20">
        <h1 className="text-2xl font-semibold">Collection not found</h1>
        <Link href="/collections" className="mt-3 inline-block text-sage hover:text-sage-hover">
          All collections
        </Link>
      </div>
    );
  }
  if (!page) {
    return <div aria-busy="true" aria-label="Loading collection" className="wrap mt-12 h-[60vh] rounded-[var(--radius-card)] bg-s1" />;
  }

  const c = page.collection;
  const videos = sorted(page.items, sort);
  const hasMore = page.items.length < c.video_count;

  return (
    <div className="wrap">
      <header className="grid items-end gap-6 border-b border-line pt-12 pb-8 md:grid-cols-[1fr_auto]">
        <div>
          <Link href="/collections" className="eyebrow hover:text-text">
            Collections
          </Link>
          <h1 className="mt-3 mb-3 text-[clamp(36px,5vw,60px)] leading-[1] font-[650] tracking-[-0.035em]">{c.title}</h1>
          {c.description && <p className="max-w-[58ch] text-muted">{c.description}</p>}
        </div>
        <dl className="flex gap-7 md:text-right">
          {[
            [String(c.video_count), "clips"],
            [formatDuration(c.total_seconds), "total runtime"],
            [formatBytes(c.hls_bytes), "HLS output"],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-sm text-subtle">{label}</dt>
              <dd className="tnum text-[22px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div role="group" aria-label="Sort clips" className="my-6 flex flex-wrap gap-2">
        {(["curated", "shortest", "longest"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={sort === key}
            onClick={() => setSort(key)}
            className="tnum h-8 rounded-full border border-line-strong px-3 text-[13px] text-muted capitalize aria-pressed:border-sage aria-pressed:text-sage"
          >
            {key}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-6">
        {videos.map((video, i) => (
          <li key={video.id} className={tileClass(i)}>
            <VideoCard video={toVideoCardData(video)} lead={i === 0} priority={i < 3} />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="h-11 rounded-lg border border-line-strong px-5 font-[550] hover:bg-s1 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : `Show more (${c.video_count - page.items.length} left)`}
          </button>
        </div>
      )}
    </div>
  );
}
