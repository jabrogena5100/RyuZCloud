"use client";

import Link from "next/link";
import { Children, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/*
 * Adapted from "Snap Carousel" by ddoemonn on 21st.dev (https://21st.dev/@ddoemonn/components/snap-carousel).
 * Kept: the keyboard model (Left/Right move one item, Home/End jump), carousel roles
 * (role="group" + aria-roledescription), per-slide "n of total" labels, a screen-reader hint and
 * previous/next buttons.
 * Changed: native CSS scroll-snap and touch scrolling instead of motion's drag physics (no
 * animation library, works with momentum scrolling on phones); several items visible at once
 * with mixed widths (a lead item can span two columns); slides stay interactive (no `inert`, so
 * every card is reachable by Tab); arrows are hidden on small screens where people swipe.
 */

type ShelfProps = {
  title: string;
  /** Short mono line beside the title, e.g. "24 clips · 52 min". */
  meta?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  /** Index of a child that spans two columns at md and up. */
  leadIndex?: number;
};

export function Shelf({ title, meta, href, linkLabel = "View all", children, leadIndex }: ShelfProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const hintId = useId();
  const items = Children.toArray(children);

  const itemStep = () => {
    const track = trackRef.current;
    const first = track?.querySelector<HTMLElement>("[data-slide]:not([data-lead])") ?? track?.querySelector<HTMLElement>("[data-slide]");
    if (!track || !first) {
      return 0;
    }
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  };

  const move = (direction: 1 | -1) => trackRef.current?.scrollBy({ left: direction * itemStep(), behavior: "smooth" });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      track.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      track.scrollTo({ left: track.scrollWidth, behavior: "smooth" });
    }
  };

  return (
    <section aria-labelledby={headingId} className="mt-14">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-[22px] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {meta && <span className="tnum order-3 w-full text-[13px] text-subtle md:order-none md:w-auto">{meta}</span>}
        {href && (
          <Link href={href} className="ml-auto text-sm text-sage hover:text-sage-hover">
            {linkLabel}
            <span className="sr-only">: {title}</span>
          </Link>
        )}
        <div className={`hidden gap-1.5 md:flex ${href ? "" : "ml-auto"}`}>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label={`Scroll ${title} back`}
            className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line-strong text-text hover:bg-s1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label={`Scroll ${title} forward`}
            className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line-strong text-text hover:bg-s1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-labelledby={headingId}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="no-scrollbar grid snap-x snap-mandatory auto-cols-[78%] grid-flow-col items-start gap-[18px] overflow-x-auto overscroll-x-contain pb-1 sm:auto-cols-[44%] md:auto-cols-[clamp(220px,22vw,300px)]"
      >
        {items.map((item, i) => (
          <div
            key={i}
            data-slide=""
            data-lead={i === leadIndex ? "" : undefined}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className={`snap-start ${i === leadIndex ? "md:col-span-2" : ""}`}
          >
            {item}
          </div>
        ))}
      </div>
      <span id={hintId} className="sr-only">
        Left and right arrow keys scroll through {items.length} videos.
      </span>
    </section>
  );
}
