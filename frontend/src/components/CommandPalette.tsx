"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Video } from "@/lib/types";
import { Thumb } from "./Thumb";

/*
 * Adapted from "Command Palette" by vovalopuh13 on 21st.dev
 * (https://21st.dev/@vovalopuh13/components/command-palette).
 * Kept: Ctrl/Cmd+K to toggle, a modal dialog with a combobox input driving a listbox
 * (aria-activedescendant), Up/Down/Home/End/Enter/Esc, Tab kept inside, grouped results with the
 * matched letters underlined, a preview pane beside the list, a live result count, and focus
 * returned to the trigger on close.
 * Changed: results come from the API's title search (debounced) plus fixed "Go to" links instead of
 * a static list with fuzzy scoring; the preview shows the clip's thumbnail, duration and
 * collection; the amber gradient (amber is reserved for processing here), cursor glow, 3D tilt,
 * key-cap animation and framer-motion are removed in favour of a 160 ms opacity fade.
 */

type Item = {
  id: string;
  group: "Videos" | "Go to";
  title: string;
  subtitle: string;
  href: string;
  video?: Video;
};

const PAGES: Item[] = [
  { id: "go-home", group: "Go to", title: "Home", subtitle: "Featured clip and collections", href: "/" },
  { id: "go-collections", group: "Go to", title: "Collections", subtitle: "Every curated collection", href: "/collections" },
  { id: "go-upload", group: "Go to", title: "Upload", subtitle: "Send a clip through the pipeline", href: "/upload" },
  { id: "go-studio", group: "Go to", title: "Your videos", subtitle: "Processing status of your uploads", href: "/studio" },
];

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, at)}
      <span className="font-semibold text-text underline decoration-sage decoration-2 underline-offset-[3px]">{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  // Ctrl/Cmd+K anywhere toggles the palette.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Debounced title search; an empty query shows the newest clips.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .listVideos({ limit: 8, q: query.trim() })
        .then((page) => !cancelled && setVideos(page.items))
        .catch(() => !cancelled && setVideos([]))
        .finally(() => !cancelled && setSearching(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found: Item[] = videos.map((video) => ({
      id: video.id,
      group: "Videos",
      title: video.title,
      subtitle: [video.collection?.title, video.channel.name].filter(Boolean).join(" · "),
      href: `/watch/${video.id}`,
      video,
    }));
    const pages = PAGES.filter((page) => !q || page.title.toLowerCase().includes(q));
    return [...found, ...pages];
  }, [videos, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const current = items[Math.min(active, items.length - 1)];

  const go = (item?: Item) => {
    if (!item) {
      return;
    }
    close();
    router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const n = items.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => (a + 1) % Math.max(1, n));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => (a - 1 + n) % Math.max(1, n));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, n - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      event.preventDefault(); // focus stays in the dialog
      inputRef.current?.focus();
    }
  };

  let index = -1;
  const groups = (["Videos", "Go to"] as const).map((name) => ({ name, rows: items.filter((item) => item.group === name) }));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-9 items-center gap-2.5 rounded-lg border border-control bg-s1 px-3 text-sm text-muted transition-colors duration-150 hover:text-text md:min-w-[220px]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="max-md:sr-only">Search clips</span>
        <kbd className="tnum ml-auto rounded border border-line-strong px-1.5 text-xs text-muted max-md:hidden">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid animate-[fade-in_160ms_var(--ease-out-soft)] justify-items-center px-4 pt-[9vh]">
          <div aria-hidden="true" onClick={close} className="absolute inset-0 bg-bg/80" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search clips and pages"
            onKeyDown={onKeyDown}
            className="relative h-max w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-s1 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-sage">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={current ? `${uid}-${current.id}` : undefined}
                aria-autocomplete="list"
                aria-label="Search clips and pages"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clips by title"
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
              />
              <kbd className="tnum rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
            </div>

            <div className="grid sm:grid-cols-[1.15fr_1fr]">
              <ul ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Results" className="max-h-[22rem] overflow-y-auto p-2">
                {items.length === 0 && (
                  <li role="presentation" className="grid h-40 place-items-center px-6 text-center text-sm text-muted">
                    {searching ? "Searching…" : `Nothing matches “${query}”.`}
                  </li>
                )}
                {groups.map(
                  (group) =>
                    group.rows.length > 0 && (
                      <li key={group.name} role="presentation">
                        <p className="eyebrow px-3 pt-2 pb-1">{group.name}</p>
                        <ul role="group" aria-label={group.name}>
                          {group.rows.map((item) => {
                            index += 1;
                            const i = index;
                            const on = i === active;
                            return (
                              <li
                                key={item.id}
                                id={`${uid}-${item.id}`}
                                data-index={i}
                                role="option"
                                aria-selected={on}
                                onMouseMove={() => setActive(i)}
                                onClick={() => go(item)}
                                className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${on ? "bg-s2" : ""}`}
                              >
                                {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sage" />}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">
                                    <Highlight text={item.title} query={query.trim()} />
                                  </span>
                                  <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                                </span>
                                {item.video?.duration_seconds != null && (
                                  <span className="tnum text-xs text-muted">{formatDuration(item.video.duration_seconds)}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ),
                )}
              </ul>

              <div className="hidden border-l border-line p-4 sm:block" aria-hidden="true">
                {current?.video ? (
                  <>
                    <Thumb src={current.video.thumbnail_url} durationSeconds={current.video.duration_seconds} />
                    <p className="mt-3 font-semibold">{current.video.title}</p>
                    <p className="mt-1 line-clamp-3 text-sm text-muted">{current.video.description || current.subtitle}</p>
                  </>
                ) : current ? (
                  <>
                    <p className="eyebrow">Page</p>
                    <p className="mt-2 font-semibold">{current.title}</p>
                    <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
              <span aria-live="polite">
                {items.length} {items.length === 1 ? "result" : "results"}
              </span>
              <span className="tnum" aria-hidden="true">
                ↑ ↓ move · ↵ open
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
