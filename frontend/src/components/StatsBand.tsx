import { formatBytes } from "@/lib/format";
import type { LibraryStats } from "@/lib/types";

/**
 * The library and the pipeline in numbers. Every figure comes from GET /stats, which aggregates
 * stored rows; nothing here is estimated or hard-coded.
 */
export function StatsBand({ stats }: { stats: LibraryStats }) {
  const hours = stats.total_seconds / 3600;
  const perVideo = stats.videos > 0 ? stats.renditions / stats.videos : null;
  const cells: { value: string; label: string }[] = [
    { value: stats.videos.toLocaleString("en"), label: stats.videos === 1 ? "clip in the library" : "clips in the library" },
    { value: hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(stats.total_seconds / 60)} min`, label: "of footage" },
    { value: perVideo === null ? "—" : perVideo.toFixed(perVideo % 1 === 0 ? 0 : 1), label: "HLS renditions per clip" },
    {
      value: stats.median_processing_ratio === null ? "—" : `${stats.median_processing_ratio.toFixed(2)}×`,
      label: "median processing time ÷ clip length",
    },
    { value: formatBytes(stats.hls_bytes), label: "of HLS output in storage" },
  ];
  return (
    <section aria-label="Library statistics" className="border-b border-line bg-s1">
      <dl className="wrap grid grid-cols-2 md:grid-cols-5">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={`flex flex-col-reverse py-4 md:border-r md:border-line md:pl-[18px] md:first:pl-0 md:last:border-r-0 ${i === 4 ? "max-md:hidden" : ""}`}
          >
            <dt className="text-sm text-subtle">{cell.label}</dt>
            <dd className="tnum text-[22px] font-medium tracking-[-0.01em]">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
