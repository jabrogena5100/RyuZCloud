// Usage (from frontend/): node scripts/mock-shots.cjs <outdir> <file.html>...   screenshots at 390/820/1440, reports horizontal overflow
const { chromium } = require('playwright');
const path = require('path');
const [,, out, ...files] = process.argv;
(async () => {
  const b = await chromium.launch();
  for (const f of files) for (const w of [390, 820, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : w < 1000 ? 1180 : 900 }, reducedMotion: 'no-preference' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('requestfailed', r => errs.push('FAIL ' + r.url()));
    await p.goto('file://' + path.resolve(f), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const name = path.basename(f, '.html') + (f.includes('?') ? '' : '');
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    console.log(name, w, 'overflow', ovf, errs.length ? errs : '');
    await ctx.close();
  }
  await b.close();
})();
