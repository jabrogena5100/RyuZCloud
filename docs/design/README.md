# Design (Phases 2 and 3)

Status: the proposal below was approved by the owner on 2026-11-24 and built in Phase 3. All 7 shortlisted components
were retrieved (paid `get_component`, 2026-11-24) and adapted; see "Retrieved components" for authors, licences and changes.

## Concept: a screening room that shows its machinery

The site is a dark viewing room for short clips, and each page also shows **how the clip got there**:

- the home page carries a band of live library and pipeline numbers;
- the watch page has a quiet "How this video got here" panel;
- the upload page turns the worker's job record into a live stepper.

The pipeline is what makes the project special, so it is part of the identity, not a hidden admin screen.

What is deliberately **not** YouTube:
- no red;
- no left sidebar, hamburger or channel avatars;
- no chip bar, no view counts (they are never incremented);
- no uniform thumbnail wall.

Instead, the layouts use these:

| Page | Layout |
| --- | --- |
| Home | A cinematic hero with a muted preview of one featured clip. Under it, a 5-cell band of numbers. Then curated rows of three kinds: a horizontal snap row whose lead card is in 2.39:1 "scope" ratio; an editorial split of one large clip beside a numbered list; and a "Just processed" row where status is part of the card. |
| Collection | A header with runtime and HLS output size in mono. Below it, a mosaic in a 4+2 / 3+3 / 2+2+2 rhythm. |
| Watch | The player sits edge to edge on black, capped so the 16:9 frame fits under the bar. Underneath, the title and description, with a side panel listing upload, source, renditions, transcode time, segments and delivery. |
| Upload / processing | The dropzone with its upload meter and the metadata form, next to a vertical pipeline stepper: Uploaded → Queued → Transcoding (one bar per rendition) → Thumbnail and playlist → Ready, plus a worker-log ticker. |
| Sign in / sign up | Split screen. On the left, a tilted contact sheet of the library with one line of copy and the flow in pills (browser → S3 → queue → FFmpeg worker → HLS · CloudFront). On the right, a plain form with Sign in / Create account tabs. On phones it collapses to a 280 px header strip. |

Mocks (static HTML, open in a browser): [`mocks/`](mocks/). Screenshots at 390, 820 and 1440 px are in `screens/mocks/`,
with the current UI for comparison in `screens/before/`. They are git-ignored; regenerate them with the commands
below. Placeholder thumbnails are generated SVG landscapes, and every number in the mocks is a placeholder. Real values
come from the API and from [metrics.md](../metrics.md).

## Tokens

These start from the owner's portfolio palette. One token is added: `--control`.

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#141414` | page |
| `s1` / `s2` | `#20201F` / `#2C2C2A` | panels, inputs / tracks, pressed states |
| `border` / `border-strong` | `#3A3A37` / `#5A5955` | dividers / decorative outlines |
| **`control`** (new) | `#6C6B67` | outlines of inputs, dropzone and search: 3.45:1 on bg and 3.06:1 on s1, meeting WCAG 1.4.11 (3:1 for UI components). `border-strong` is only 2.63:1 |
| `text` / `muted` / `subtle` | `#ECEAE4` / `#B2AEA6` / `#8F8C84` | body / secondary / tertiary (subtle only on bg or s1, at ≥ 14 px) |
| `sage` / `sage-hover` | `#A3B18A` / `#B7C4A0` | primary buttons (text in `bg`), links, focus ring, progress, "ready" |
| `amber` | `#D4A65A` | "processing" only, and the DEMO flag |
| Fonts | Geist, Geist Mono | Mono for durations, counts, statuses and timestamps |

**Contrast** (WCAG 2 relative luminance, computed 2026-11-23 with a Python script; status: Documented):

| Foreground | on bg | on s1 | on s2 |
| --- | --- | --- | --- |
| text | 15.31 | 13.55 | 11.63 |
| muted | 8.33 | 7.38 | 6.33 |
| subtle | 5.48 | 4.86 | **4.17 (not allowed)** |
| sage | 8.08 | 7.15 | 6.14 |
| amber | 8.25 | 7.30 | 6.26 |
| bg text on a sage button | 8.08 | | |
| bg text on sage-hover | 10.02 | | |

**Motion:** 120 to 240 ms, `cubic-bezier(0.2, 0, 0, 1)`, opacity and transform only, all removed under
`prefers-reduced-motion`. Previews are muted, play only on hover or focus (the hero plays only when motion is allowed),
and fall back to the poster image.

## 21st.dev shortlist (search only; nothing retrieved)

Each `get_component` call spends the owner's paid quota, so nothing below has been fetched. The licence terms will be
read from each component's 21st.dev page at retrieval time and recorded in the table that follows. They are not known yet.

| # | Where | Pick (author) | URL | Why | Adaptation planned | Runner-up |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sign in / sign up | Split Login (mohammadshehadeh) | https://21st.dev/@mohammadshehadeh/components/login-03 | Editorial split layout with a quiet form pane; collapses on mobile | Replace GitHub-only login with the existing email/password `AuthForm` logic; contact-sheet aside instead of animated paths; tokens; no radial glows | Sign In Split Screen (felipemenezes098), https://21st.dev/@felipemenezes098/components/sign-in-6 |
| 2 | Home hero | PrismaHero (rahil1202) | https://21st.dev/@rahil1202/components/prisma-hero | Full-bleed background video with an overlaid headline | Feed the featured clip's HLS (muted, `playsinline`, poster); a left scrim only; reduced motion shows the poster; drop the floating nav and the word-reveal animation | Scroll-Triggered Video Hero (daiwiikharihar) |
| 3 | Curated rows | Snap Carousel (ddoemonn) | https://21st.dev/@ddoemonn/components/snap-carousel | Headless hook, keyboard navigation, peek edges, CSS scroll-snap | Mixed card widths (lead in 2.39:1); arrows hidden on touch; no momentum effects under reduced motion | Zoom Slider (hyperiux) |
| 4 | Video card | HoverPlayCard (ruixen.ui) | https://21st.dev/@ruixen.ui/components/hover-play-card | Muted hover preview that pauses on leave | **Remove the click-to-unmute behaviour** (the brief forbids sound in previews); play on hover or focus after a 300 ms delay; poster only on touch and under reduced motion | Interactive Video Player (reuno-ui), https://21st.dev/@reuno-ui/components/skiper67 |
| 5 | Upload dropzone | UploadThing Dropzone (elements-) | https://21st.dev/@elements-/components/uploadthing-dropzone | Backend-agnostic, with per-file progress and validation | Wire to the existing presigned-PUT flow (`lib/upload.ts`); one file at a time; mono speed and byte readout | Progress Ring Upload (uploadcn) |
| 6 | Pipeline stepper | Steps (adit-firdaus) | https://21st.dev/@adit-firdaus/components/steps | Vertical layout with complete / current / upcoming / **error** states | Five pipeline stages, amber for the current stage, sage for done, error state for failed jobs with the API's reason; per-rendition sub-bars | Vertical Titled Stepper (sean0205) |
| 7 | Search | Command Palette (vovalopuh13) | https://21st.dev/@vovalopuh13/components/command-palette | Combobox/listbox semantics, Home/End/Esc; a preview pane suits thumbnails | Search titles via a new API endpoint; preview pane shows the thumbnail and duration; drop the tilt effect | Command Palette (ebnsina) |

Retrieval plan: 7 `get_component` calls, one per row, only after approval. Each retrieved component gets a row here with
its name, author, URL, the licence as stated on 21st.dev, and what was changed.

## Retrieved components (Phase 3)

Every component was rewritten as a dependency-free React and Tailwind component: no `motion`/`framer-motion`,
`lucide-react`, shadcn `Button` or `react-icons` was added. Each source file's header comment repeats the kept/changed list.

| Component (author) | URL | Licence as stated | Became | Main changes |
| --- | --- | --- | --- | --- |
| Split Login (Mohammad Shehadeh / Hirael) | https://21st.dev/@mohammadshehadeh/components/login-03 | **MIT** (header of the retrieved source) | `components/AuthSplit.tsx` | Email/password instead of GitHub-only; static contact sheet of real thumbnails instead of animated paths; pipeline pills; no serif, glows or motion |
| PrismaHero (rahil1202) | https://21st.dev/@rahil1202/components/prisma-hero | Not stated in the retrieved source; check the component page | `components/Hero.tsx` | Featured clip's own HLS (muted, lowest rendition, starts after load, never under reduced motion or Save-Data); CSS word reveal; no nav, noise or framer-motion |
| Snap Carousel (ddoemonn) | https://21st.dev/@ddoemonn/components/snap-carousel | Not stated; check the page | `components/Shelf.tsx` | Native scroll-snap instead of drag physics; several items visible with a double-width lead; slides stay tabbable |
| HoverPlayCard (ruixen.ui) | https://21st.dev/@ruixen.ui/components/hover-play-card | Not stated; check the page | `components/VideoCard.tsx` | **No sound ever** (click-to-unmute removed); 350 ms delay; also on focus; HLS 360p; off on touch, reduced motion, Save-Data |
| UploadThing Dropzone (elements-) | https://21st.dev/@elements-/components/uploadthing-dropzone | Not stated; check the page | `components/Dropzone.tsx` | Single file; real XHR progress on the page instead of a simulated timer; no uploaded-file list or blob URLs |
| Steps (adit-firdaus) | https://21st.dev/@adit-firdaus/components/steps | Not stated; check the page | `components/PipelineSteps.tsx` | Vertical, read-only; per-step system and measured time; sage/amber/danger statuses; no sliding thumb or press feedback |
| Command Palette (vovalopuh13) | https://21st.dev/@vovalopuh13/components/command-palette | Not stated; check the page | `components/CommandPalette.tsx` | API title search (debounced) plus "Go to" pages; thumbnail preview; no amber gradient, glow, tilt or framer-motion |

**Owner action:** open each URL above and record the licence the page states in this column before the next commit that
mentions these components publicly. Six of the seven retrieved sources carry no licence line.

## API and schema work (built in Phase 3)

These are gaps found in Phase 0. None is built yet:

1. **Collections and a featured clip**: tables plus `GET /collections`, `GET /collections/{slug}`, and a featured flag.
2. **Pipeline detail**: expose the job's stage, per-rendition progress and per-stage timestamps, so the stepper shows real
   times. The worker already records the stage, and the rest needs columns.
3. **Library stats** for the home band: clip count, hours, renditions, and median transcode time computed from the job records.
4. **Search**: a simple `ILIKE` or trigram search on titles for the palette.
5. **Hover preview**: either load the 360p HLS on hover (no new assets) or have the worker cut a 3 s low-bitrate preview.
   Recommendation: start with 360p HLS on hover, then measure.
6. **Fonts**: self-host Geist through the `geist` npm package (`next/font/local` under the hood). The owner installs it.

## Baseline (current UI), recorded before any redesign

Run on 2026-11-23, against a production build (`next build`, `next start`) of commit `f14c846` on the Ubuntu VM, with the
local API behind it. Chromium (Playwright 1.65), cold context per run, 3 runs per page, medians. Raw output is in
[P4-page-weight-before-2026-11-23.json](../evidence/metrics/P4-page-weight-before-2026-11-23.json). Lighthouse is **not
run** (not installed).

| Page | Transferred | JS | Requests | Load (median, range) | Horizontal overflow at 390 / 820 / 1440 |
| --- | --- | --- | --- | --- | --- |
| `/` | 199,156 B | 131,577 B | 20 | 717 ms (580–905) | 0 / 0 / 0 |
| `/login` | 151,148 B | 134,438 B | 19 | 652 ms (292–731) | 0 / 0 / 0 |
| `/register` | 151,229 B | 134,438 B | 19 | 635 ms (583–694) | 0 / 0 / 0 |
| `/upload` (signed out) | 146,396 B | 131,577 B | 17 | 584 ms (520–622) | 0 / 0 / 0 |
| `/studio` (signed out) | 146,389 B | 131,577 B | 17 | 628 ms (487–757) | 0 / 0 / 0 |
| `/watch/<id>` | 550,963 B | 135,737 B | 27 | 660 ms (389–678) | 0 / 0 / 0 |

`next build` reported 102 kB of First Load JS shared by all routes, and 108 to 113 kB per route. Load times are
localhost times, so they show relative weight, not real-network speed.

## Regenerate

```bash
cd ~/projects/RyuZCloud/frontend
node scripts/mock-shots.cjs ../docs/design/screens/mocks ../docs/design/mocks/{home,collection,watch,upload,auth}.html
# Baseline or after-numbers against any running build (prod build recommended; see metrics.md P4):
node scripts/measure-pages.cjs http://localhost:3000 ../docs/design/screens/after 3
```
