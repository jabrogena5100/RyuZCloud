// Placeholder "footage" for the mocks: layered landscape silhouettes in muted tones, so the layout can be
// judged without real clips. Replaced by pipeline-generated thumbnails in Phase 4.
const SCENES = {
  dawn: ["#2b2a33", "#8c6f5a", "#d1a27c", "#3a3330", "#1f1c1b"],
  ocean: ["#1b2830", "#3f6370", "#86a3a6", "#22343b", "#141d22"],
  forest: ["#1d241d", "#46553f", "#8a9a72", "#273024", "#151a14"],
  desert: ["#3a2d24", "#9b7651", "#d9b483", "#5b4332", "#2a1f18"],
  night: ["#0e1115", "#1d2733", "#3a4b5e", "#151b22", "#0a0d10"],
  snow: ["#4d555e", "#8e979f", "#d3d6d8", "#666d73", "#3a4046"],
  dusk: ["#22202b", "#56475a", "#b07f6d", "#2f2a35", "#18161d"],
  fog: ["#2e302e", "#5d625c", "#a3a89f", "#3f433e", "#232522"],
};

function scene(name, seed = 1) {
  const [top, mid, glow, near, ground] = SCENES[name] || SCENES.fog;
  const r = (n) => ((Math.sin(seed * 97.13 + n * 13.7) + 1) / 2);
  const ridge = (y, amp, n) => {
    let d = `M0 ${y}`;
    for (let x = 0; x <= 320; x += 32) d += ` L${x} ${(y - amp * r(n + x)).toFixed(1)}`;
    return d + " L320 180 L0 180Z";
  };
  const sunX = 60 + r(9) * 200, sunY = 40 + r(4) * 40;
  const dots = name === "night"
    ? Array.from({ length: 26 }, (_, i) => `<rect x="${(r(i) * 320).toFixed(0)}" y="${(110 + r(i + 40) * 50).toFixed(0)}" width="2" height="2" fill="#d4a65a" opacity="${(0.3 + r(i + 7) * 0.6).toFixed(2)}"/>`).join("")
    : "";
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="g${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="0.75" stop-color="${mid}"/></linearGradient>
    <radialGradient id="s${seed}"><stop offset="0" stop-color="${glow}" stop-opacity="0.9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
    <rect width="320" height="180" fill="url(#g${seed})"/>
    <circle cx="${sunX}" cy="${sunY}" r="70" fill="url(#s${seed})"/>
    <path d="${ridge(120, 40, 1)}" fill="${near}" opacity="0.85"/>
    <path d="${ridge(150, 26, 5)}" fill="${ground}"/>${dots}
  </svg>`;
}

document.querySelectorAll("[data-scene]").forEach((el, i) => {
  el.insertAdjacentHTML("afterbegin", scene(el.dataset.scene, Number(el.dataset.seed || i + 1)));
});
