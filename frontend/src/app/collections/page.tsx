"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Thumb } from "@/components/Thumb";
import { api } from "@/lib/api";
import { formatBytes, formatClips } from "@/lib/format";
import type { Collection } from "@/lib/types";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .collections()
      .then((res) => !cancelled && setCollections(res.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = collections?.filter((c) => c.video_count > 0) ?? [];

  return (
    <div className="wrap">
      <header className="border-b border-line pt-12 pb-8">
        <p className="eyebrow">Library</p>
        <h1 className="mt-3 text-[clamp(36px,5vw,60px)] leading-[1] font-[650] tracking-[-0.035em]">Collections</h1>
        <p className="mt-3 max-w-[58ch] text-muted">Curated sets of clips. Every one was uploaded straight to storage and transcoded by the worker.</p>
      </header>

      {failed && (
        <p role="alert" className="mt-8 text-danger">
          Couldn&apos;t load the collections. Try refreshing the page.
        </p>
      )}
      {collections === null && !failed && (
        <div aria-busy="true" aria-label="Loading collections" className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-video rounded-[var(--radius-card)] bg-s1" />
          ))}
        </div>
      )}
      {collections !== null && visible.length === 0 && <p className="mt-8 text-muted">No collections have clips yet.</p>}

      <ul className="mt-8 grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c, i) => (
          <li key={c.slug}>
            <Link href={`/collections/${c.slug}`} className="group block rounded-[var(--radius-card)] focus-visible:outline-offset-4">
              <Thumb src={c.cover_url} priority={i < 3}>
                <span aria-hidden="true" className="absolute inset-0 rounded-[var(--radius-card)] ring-1 ring-transparent ring-inset group-hover:ring-line-strong" />
              </Thumb>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]">{c.title}</h2>
              <p className="tnum mt-0.5 text-[13px] text-muted">
                {formatClips(c.video_count)} · {Math.round(c.total_seconds / 60)} min · {formatBytes(c.hls_bytes)} HLS
              </p>
              {c.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{c.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
