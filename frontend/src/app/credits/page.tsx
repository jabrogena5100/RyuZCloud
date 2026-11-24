import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credits" };

/**
 * Credits for the demo library. The per-clip list (source page, author, licence, date retrieved)
 * is generated from the content manifest in Phase 4; until then this page says so plainly.
 */
export default function CreditsPage() {
  return (
    <div className="wrap max-w-3xl pt-12">
      <p className="eyebrow">Credits</p>
      <h1 className="mt-3 text-[clamp(32px,4.5vw,52px)] leading-[1] font-[650] tracking-[-0.035em]">Where the clips come from</h1>
      <p className="mt-5 text-muted">
        RyuZCloud is a portfolio demo. Video titles and channels are invented. The footage is used only under licences that allow
        it: CC0 or public domain (Wikimedia Commons), the Pexels licence, and the Pixabay licence. Nothing is taken from
        YouTube or other platforms.
      </p>
      <p className="mt-4 text-muted">
        Each clip&apos;s source page, author, licence and retrieval date will be listed here once the demo library is seeded.
      </p>
      <h2 className="mt-10 text-xl font-semibold tracking-[-0.02em]">Software and design</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
        <li>Built with Go, Next.js, PostgreSQL, FFmpeg, hls.js and Terraform.</li>
        <li>Typeface: Geist and Geist Mono (SIL Open Font License).</li>
        <li>
          Interface components adapted from 21st.dev; authors and changes are recorded in the repository&apos;s design notes
          (docs/design/README.md).
        </li>
      </ul>
    </div>
  );
}
