import type { Metadata } from "next";
import { CreditsList, type CreditsFile } from "@/components/CreditsList";
import credits from "../../../public/credits.json";

export const metadata: Metadata = { title: "Credits" };

const LINK = "text-sage underline underline-offset-4 hover:text-sage-hover";

/**
 * Credits for the demo library. The per-clip list comes from public/credits.json, which
 * scripts/library.py writes from the content manifest when the clips are downloaded. It is
 * imported at build time, so the page is static; a new list needs a rebuild (the dev server
 * picks it up by itself). The file also stays public at /credits.json.
 */
export default function CreditsPage() {
  return (
    <div className="wrap max-w-4xl pt-12">
      <p className="eyebrow">Credits</p>
      <h1 className="mt-3 text-[clamp(32px,4.5vw,52px)] leading-[1] font-[650] tracking-[-0.035em]">Where the clips come from</h1>
      <p className="mt-5 text-muted">
        RyuZCloud is a portfolio demo. Video titles and channels are invented. The footage comes from two sources, under licences
        that allow this use:
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
        <li>
          Videos from{" "}
          <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer" className={LINK}>
            Pixabay
          </a>
          , under the{" "}
          <a href="https://pixabay.com/service/license-summary/" target="_blank" rel="noopener noreferrer" className={LINK}>
            Pixabay Content License
          </a>
          .
        </li>
        <li>
          Videos from{" "}
          <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer" className={LINK}>
            Wikimedia Commons
          </a>{" "}
          that are CC0 or in the public domain, each checked against its file page.
        </li>
      </ul>
      <p className="mt-4 text-muted">Nothing is taken from YouTube or other video platforms. Each clip and its source is listed below.</p>

      <CreditsList file={credits as CreditsFile} />

      <h2 className="mt-12 text-xl font-semibold tracking-[-0.02em]">Software and design</h2>
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
