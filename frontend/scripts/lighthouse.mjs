// Lighthouse, mobile and desktop, several runs per page (metrics row P4).
//
// Usage (from frontend/): node scripts/lighthouse.mjs <base-url> <out.json> [runs=3] [page ...]
//   pages default to: / /login /credits /collections /watch/<featured id>
//   A page that answers 404 (a route the build doesn't have) is skipped and listed as such.
//
// Uses the Lighthouse in devDependencies and Playwright's Chromium (no system Chrome needed).
// Throttling is Lighthouse's default "simulate" mode: the page loads unthrottled and Lighthouse models a
// slow-4G, 4x-CPU phone (mobile) or a fast desktop. Scores are therefore estimates; the median of `runs`
// is reported with the range, never the best run.
import fs from "node:fs";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";

const [, , base, out, runsArg, ...pageArgs] = process.argv;
if (!base || !out) {
  console.error("usage: node scripts/lighthouse.mjs <base-url> <out.json> [runs=3] [page ...]");
  process.exit(2);
}
const runs = +runsArg || 3;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const range = (a) => ({ median: Math.round(median(a) * 1000) / 1000, min: Math.min(...a), max: Math.max(...a) });

async function defaultPages() {
  const res = await fetch(base + "/api/v1/videos/featured");
  if (!res.ok) throw new Error(`GET /videos/featured: HTTP ${res.status} (is the stack running?)`);
  const featured = await res.json();
  return ["/", "/login", "/credits", "/collections", `/watch/${featured.id}`];
}

const pages = pageArgs.length ? pageArgs : await defaultPages();
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  // --no-sandbox as Playwright itself launches Chromium; Ubuntu's user-namespace restriction blocks the sandbox.
  // Only the local builds under test are opened in this browser.
  chromeFlags: ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-extensions"],
});
const report = {
  base,
  date: new Date().toISOString(),
  runs,
  lighthouse: JSON.parse(fs.readFileSync(new URL("../node_modules/lighthouse/package.json", import.meta.url))).version,
  chromium: chromium.executablePath().match(/chromium[-_][^/]+/)?.[0] ?? "playwright chromium",
  throttling: "simulate (Lighthouse defaults)",
  results: {},
  skipped: [],
};

try {
  for (const path of pages) {
    const status = (await fetch(base + path, { redirect: "manual" })).status;
    if (status === 404) {
      report.skipped.push({ path, reason: "HTTP 404 on this build" });
      continue;
    }
    for (const formFactor of ["mobile", "desktop"]) {
      const samples = [];
      for (let r = 0; r < runs; r++) {
        const result = await lighthouse(
          base + path,
          { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] },
          formFactor === "desktop" ? desktopConfig : undefined,
        );
        const { categories: c, audits: a } = result.lhr;
        const sample = {
          performance: Math.round(c.performance.score * 100),
          accessibility: Math.round(c.accessibility.score * 100),
          best_practices: Math.round(c["best-practices"].score * 100),
          seo: Math.round(c.seo.score * 100),
          fcp_ms: Math.round(a["first-contentful-paint"].numericValue),
          lcp_ms: Math.round(a["largest-contentful-paint"].numericValue),
          tbt_ms: Math.round(a["total-blocking-time"].numericValue),
          cls: Math.round(a["cumulative-layout-shift"].numericValue * 1000) / 1000,
          si_ms: Math.round(a["speed-index"].numericValue),
          transfer_bytes: Math.round(a["total-byte-weight"].numericValue),
          runtime_error: result.lhr.runtimeError?.code ?? null,
        };
        samples.push(sample);
        console.error(`${formFactor} ${path} run ${r + 1}: perf ${sample.performance}, LCP ${sample.lcp_ms} ms, TBT ${sample.tbt_ms} ms, CLS ${sample.cls}, a11y ${sample.accessibility}${sample.runtime_error ? ", " + sample.runtime_error : ""}`);
      }
      const keys = Object.keys(samples[0]).filter((k) => k !== "runtime_error");
      report.results[`${formFactor} ${path}`] = {
        ...Object.fromEntries(keys.map((k) => [k, range(samples.map((s) => s[k]))])),
        runtime_errors: samples.map((s) => s.runtime_error).filter(Boolean),
        samples,
      };
    }
  }
} finally {
  await chrome.kill();
}

fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const table = Object.entries(report.results).map(([k, v]) => ({
  page: k,
  perf: v.performance.median,
  "perf range": `${v.performance.min}-${v.performance.max}`,
  "LCP ms": v.lcp_ms.median,
  "TBT ms": v.tbt_ms.median,
  CLS: v.cls.median,
  a11y: v.accessibility.median,
  BP: v.best_practices.median,
  SEO: v.seo.median,
  bytes: v.transfer_bytes.median,
}));
console.table(table);
if (report.skipped.length) console.log("skipped:", report.skipped);
