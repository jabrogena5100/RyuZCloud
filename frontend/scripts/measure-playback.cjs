// Time to first frame and rebuffering on the watch page (metrics row P3).
//
// Usage (from frontend/): node scripts/measure-playback.cjs <base-url> <out.json> [runs=3]
//   VIDEO_IDS=id1,id2   videos to play (default: the featured clip plus the 3 longest other public ready clips)
//   WATCH_SECONDS=20    how long to keep playing after the first frame, to count stalls
//
// For every video, profile and run: a cold browser context opens /watch/<id>. As soon as the <video>
// element exists, the script calls play() (muted), as a viewer who clicks play straight away would.
// The first frame is the first requestVideoFrameCallback, i.e. a decoded frame handed to the compositor.
//   ttff_from_play_ms        play() call -> first frame
//   first_frame_from_nav_ms  navigation start -> first frame (includes page load, hls.js load, playlist, first segment)
//   rebuffers / stalled_ms   `waiting` events after the first frame, and the time until `playing` resumed
//   height_first / height_end  rendition picked by hls.js at the first frame and at the end
// Profiles: "local" (no throttling) and "slow-4g-cpu4x" (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, CPU 4x
// slower), the same network numbers Lighthouse's mobile profile simulates; here they are applied for real.
const { chromium } = require("playwright");
const fs = require("fs");

const [, , base, out, runsArg] = process.argv;
if (!base || !out) {
  console.error("usage: node scripts/measure-playback.cjs <base-url> <out.json> [runs=3]");
  process.exit(2);
}
const runs = +runsArg || 3;
const watchSeconds = +(process.env.WATCH_SECONDS || 20);
const PROFILES = {
  local: null,
  "slow-4g-cpu4x": { latency: 150, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9, cpu: 4 },
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const stats = (a) => (a.length ? { median: Math.round(median(a)), min: Math.min(...a), max: Math.max(...a), n: a.length } : null);

async function pickVideos() {
  if (process.env.VIDEO_IDS) {
    return process.env.VIDEO_IDS.split(",").map((id) => ({ id: id.trim() }));
  }
  const get = async (path) => {
    const res = await fetch(base + "/api/v1" + path);
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status} (is the stack running?)`);
    return res.json();
  };
  const featured = await get("/videos/featured");
  const feed = await get("/videos?limit=50");
  const others = feed.items
    .filter((v) => v.id !== featured.id && v.status === "ready")
    .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 3);
  return [featured, ...others].map((v) => ({ id: v.id, title: v.title, duration_seconds: v.duration_seconds }));
}

async function measureOnce(browser, id, profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  if (profile) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  }
  // Installed before any page script runs: plays the <video> the moment it is attached and records events.
  await page.addInitScript(() => {
    const m = (window.__ttff = { waiting: [], playingAfterWait: [], error: null });
    const hook = (video) => {
      if (m.video) return;
      m.video = true;
      video.muted = true;
      m.playCalledAt = performance.now();
      video.play().catch((e) => (m.error = "play() rejected: " + e.message));
      video.requestVideoFrameCallback(() => {
        m.firstFrameAt = performance.now();
        m.heightFirst = video.videoHeight;
      });
      video.addEventListener("waiting", () => m.firstFrameAt && m.waiting.push(performance.now()));
      video.addEventListener("playing", () => m.waiting.length > m.playingAfterWait.length && m.playingAfterWait.push(performance.now()));
      video.addEventListener("error", () => (m.error = "media error " + (video.error && video.error.code)));
      m.el = video;
    };
    new MutationObserver(() => {
      const v = document.querySelector("video");
      if (v) hook(v);
    }).observe(document, { childList: true, subtree: true });
  });

  const result = { id };
  try {
    await page.goto(`${base}/watch/${id}`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.__ttff && (window.__ttff.firstFrameAt || window.__ttff.error), null, { timeout: 60000 });
    await page.waitForTimeout(watchSeconds * 1000);
    Object.assign(
      result,
      await page.evaluate(() => {
        const m = window.__ttff;
        const stalls = m.waiting.map((t, i) => (m.playingAfterWait[i] ?? performance.now()) - t);
        return {
          error: m.error,
          ttff_from_play_ms: m.firstFrameAt ? Math.round(m.firstFrameAt - m.playCalledAt) : null,
          first_frame_from_nav_ms: m.firstFrameAt ? Math.round(m.firstFrameAt) : null,
          rebuffers: m.waiting.length,
          stalled_ms: Math.round(stalls.reduce((a, b) => a + b, 0)),
          height_first: m.heightFirst ?? null,
          height_end: m.el ? m.el.videoHeight : null,
          played_s: m.el ? Math.round(m.el.currentTime * 10) / 10 : null,
          ended: m.el ? m.el.ended : null,
          player: m.el ? (m.el.currentSrc.startsWith("blob:") ? "hls.js (MSE)" : "native HLS") : null,
        };
      }),
    );
  } catch (e) {
    result.error = String(e.message || e).split("\n")[0];
  }
  await ctx.close();
  return result;
}

(async () => {
  const videos = await pickVideos();
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const report = { base, date: new Date().toISOString(), runs, watch_seconds: watchSeconds, browser: `chromium ${browser.version()}`, profiles: {}, videos, samples: [] };
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const v of videos) {
      for (let r = 0; r < runs; r++) {
        const s = { profile: name, run: r + 1, ...(await measureOnce(browser, v.id, profile)) };
        report.samples.push(s);
        console.error(`${name} ${v.id} run ${r + 1}: ttff ${s.ttff_from_play_ms} ms, from nav ${s.first_frame_from_nav_ms} ms, rebuffers ${s.rebuffers}, ${s.height_first}p -> ${s.height_end}p${s.error ? ", " + s.error : ""}`);
      }
    }
    const ok = report.samples.filter((s) => s.profile === name && s.ttff_from_play_ms !== null && !s.error);
    report.profiles[name] = {
      settings: profile,
      ttff_from_play_ms: stats(ok.map((s) => s.ttff_from_play_ms)),
      first_frame_from_nav_ms: stats(ok.map((s) => s.first_frame_from_nav_ms)),
      rebuffers_total: ok.reduce((a, s) => a + s.rebuffers, 0),
      stalled_ms_total: ok.reduce((a, s) => a + s.stalled_ms, 0),
      samples_ok: ok.length,
      samples_failed: report.samples.filter((s) => s.profile === name).length - ok.length,
    };
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.profiles, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
