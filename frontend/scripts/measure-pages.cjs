// Usage (from frontend/): node scripts/measure-pages.cjs <base-url> <outdir> [runs=3]
// For each page: cold browser context per run, records transferred bytes (all / JS / CSS / images),
// request count, DOMContentLoaded and load (ms), and horizontal overflow at 390/820/1440 px.
//   WATCH_ID=<id>  video for /watch (default: the featured video from the API)
//   SHOTS=0        skip the full-page screenshots
// A page that answers 404 (a route this build doesn't have) is skipped and listed under `skipped`.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, base, out, runsArg] = process.argv;
const runs = +runsArg || 3;
const shots = process.env.SHOTS !== '0';
const widths = [390, 820, 1440];
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  let watchId = process.env.WATCH_ID;
  if (!watchId) {
    const res = await fetch(base + '/api/v1/videos/featured');
    if (!res.ok) throw new Error(`GET /videos/featured: HTTP ${res.status} (is the stack running?)`);
    watchId = (await res.json()).id;
  }
  const pages = { home: '/', login: '/login', register: '/register', upload: '/upload', studio: '/studio',
    watch: '/watch/' + watchId, collections: '/collections', credits: '/credits' };
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const result = {};
  const skipped = [];
  for (const [name, path] of Object.entries(pages)) {
    if ((await fetch(base + path, { redirect: 'manual' })).status === 404) {
      skipped.push(path);
      continue;
    }
    const samples = [];
    for (let r = 0; r < runs; r++) {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(base + path, { waitUntil: 'networkidle' });
      await p.waitForTimeout(500);
      samples.push(await p.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        const sum = f => res.filter(f).reduce((t, e) => t + e.transferSize, 0);
        return {
          totalBytes: nav.transferSize + sum(() => true),
          jsBytes: sum(e => e.name.endsWith('.js') || e.initiatorType === 'script'),
          cssBytes: sum(e => e.name.endsWith('.css')),
          imgBytes: sum(e => e.initiatorType === 'img'),
          requests: res.length + 1,
          dcl: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
        };
      }));
      await ctx.close();
    }
    const keys = Object.keys(samples[0]);
    result[name] = Object.fromEntries(keys.map(k => [k, { median: median(samples.map(s => s[k])),
      min: Math.min(...samples.map(s => s[k])), max: Math.max(...samples.map(s => s[k])) }]));
    for (const w of widths) {
      const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : w < 1000 ? 1180 : 900 } });
      const p = await ctx.newPage();
      await p.goto(base + path, { waitUntil: 'networkidle' });
      await p.waitForTimeout(300);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      result[name]['overflow_' + w] = overflow;
      if (shots) await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
  await b.close();
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify({ base, runs, date: new Date().toISOString(), watch_id: watchId, skipped, result }, null, 2));
  console.log(JSON.stringify(result, null, 1));
})();
