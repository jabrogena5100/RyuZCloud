// Usage (from frontend/): node scripts/measure-pages.cjs <base-url> <outdir> [runs=3]
// For each page: cold browser context per run, records transferred bytes (all / JS / CSS / images),
// request count, DOMContentLoaded and load (ms). Screenshots at 390/820/1440 on the last run.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, base, out, runsArg] = process.argv;
const runs = +runsArg || 3;
const pages = { home: '/', login: '/login', register: '/register', upload: '/upload', studio: '/studio',
  watch: '/watch/' + (process.env.WATCH_ID || '111bd3aa-d310-44b5-bbf1-2f3b43d3f8ae') }; // WATCH_ID = any ready public video
const widths = [390, 820, 1440];
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const result = {};
  for (const [name, path] of Object.entries(pages)) {
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
      await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
  await b.close();
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify({ base, runs, date: new Date().toISOString(), result }, null, 2));
  console.log(JSON.stringify(result, null, 1));
})();
