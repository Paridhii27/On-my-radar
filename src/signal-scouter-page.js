import { initHandsSensor } from "./sensors/hands.js";
import { playRadarStartSound } from "./radar-start-sound.js";

/** Same warm off-white as Field Signal */
const BG = "#fdfdfd";

/**
 * Files live in `public/scouter-memories/` (copied to `dist/scouter-memories/` as-is).
 * Uses `import.meta.env.BASE_URL` so paths work with `vite`, `vite preview`, and custom `base`.
 */
function scouterPublicUrl(pathFromPublic) {
  const base = import.meta.env.BASE_URL;
  const rel = pathFromPublic.replace(/^\/+/, "");
  return `${base}${rel}`;
}

/**
 * Palm “focus” on a memory: 0 outside beam, 1 when palm is centered on the image.
 * Outer edge = first contact (unclear). Inner = full clarity + full text.
 */
const FOCUS_OUTER_PX = 232;
const FOCUS_INNER_PX = 52;
const ATTENTION_POOL_RADIUS = 300;

/** Bundled memories — filenames must match `public/scouter-memories/` exactly (case-sensitive). */
const MEMORY_SIGNALS = [
  {
    src: scouterPublicUrl("scouter-memories/signal-1.svg"),
    nx: 0.14,
    ny: 0.22,
    memory:
      "The porch after summer rain — metal cool under your hands, streetlights just coming on.",
  },
  {
    src: scouterPublicUrl("scouter-memories/signal-2.JPG"),
    nx: 0.82,
    ny: 0.28,
    memory:
      "A trail you walked alone once. You thought you’d remember every turn; you remembered the quiet instead.",
  },
  {
    src: scouterPublicUrl("scouter-memories/signal-3.jpeg"),
    nx: 0.38,
    ny: 0.58,
    memory:
      "Someone’s kitchen at 2 a.m. — toast, a half-finished problem set, laughter you weren’t expecting.",
  },
  {
    src: scouterPublicUrl("scouter-memories/signal-4.jpeg"),
    nx: 0.76,
    ny: 0.74,
    memory:
      "A borrowed room that fit wrong until it didn’t. You still think of the light switch on the left.",
  },
  {
    src: scouterPublicUrl("scouter-memories/signal-5.jpeg"),
    nx: 0.22,
    ny: 0.86,
    memory:
      "The platform where goodbyes stopped feeling like endings — just doors sliding shut and the city humming.",
  },
  {
    src: scouterPublicUrl("scouter-memories/signal-6.svg"),
    nx: 0.52,
    ny: 0.38,
    memory:
      "A detail you keep returning to — the shape of it still clear when the rest fades.",
  },
];

let canvas, ctx;
let width, height;
/** @type {{ img: HTMLImageElement; x: number; y: number; width: number; height: number; memory: string; nx: number; ny: number }[]} */
let imagesData = [];
let handSensorController = null;
let flashlightX = null;
let flashlightY = null;
let rafId = null;

const startBtn = document.getElementById("start-scouter-btn");
const startPrimary = document.getElementById("sst-start-primary");
const loadStatus = document.getElementById("load-status");
const statusDot = document.getElementById("hands-status");
const hintLayer = document.getElementById("sst-hint-layer");
const videoEl = document.getElementById("webcam-video");
const navBack = document.querySelector(".absolute-nav");

function palmFocusFromDistance(dist) {
  if (dist >= FOCUS_OUTER_PX) return 0;
  if (dist <= FOCUS_INNER_PX) return 1;
  return (FOCUS_OUTER_PX - dist) / (FOCUS_OUTER_PX - FOCUS_INNER_PX);
}

/** How much of the memory sentence to show; needs higher focus for later words. */
function memoryCharBudget(focus, fullLength) {
  if (focus < 0.12 || fullLength === 0) return 0;
  const t = (focus - 0.12) / 0.88;
  const shaped = Math.pow(Math.max(0, Math.min(1, t)), 1.5);
  return Math.floor(shaped * fullLength);
}

function truncateMemoryToWords(full, maxChars) {
  if (maxChars <= 0) return "";
  if (maxChars >= full.length) return full;
  let cut = full.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.45) cut = cut.slice(0, lastSpace);
  return cut.trimEnd();
}

function applyLayout() {
  const pad = 150;
  const safeW = Math.max(80, width - 300);
  const safeH = Math.max(80, height - 300);
  for (const d of imagesData) {
    d.x = pad + d.nx * safeW;
    d.y = pad + d.ny * safeH;
  }
}

function initCanvas() {
  canvas = document.getElementById("scouter-canvas");
  ctx = canvas.getContext("2d");

  function resize() {
    const wrap = canvas.closest(".sst-canvas-wrap");
    if (wrap) {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    canvas.width = width;
    canvas.height = height;
    if (imagesData.length) applyLayout();
  }
  window.addEventListener("resize", resize);
  resize();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function wrapMemoryLines(text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const tw = ctx.measureText(test).width;
    if (tw > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadBundledMemories() {
  if (loadStatus) loadStatus.textContent = "Loading hidden signals…";
  imagesData = [];

  const entries = await Promise.all(
    MEMORY_SIGNALS.map(async (def) => {
      const img = await loadImage(def.src);
      const scale = Math.min(250 / img.width, 250 / img.height);
      return {
        img,
        nx: def.nx,
        ny: def.ny,
        x: 0,
        y: 0,
        width: img.width * scale,
        height: img.height * scale,
        memory: def.memory,
      };
    }),
  );

  imagesData = entries;
  applyLayout();
  if (loadStatus) {
    loadStatus.textContent = `${MEMORY_SIGNALS.length} signals hidden — nothing is marked on screen.`;
  }
  startBtn?.classList.remove("hidden");
  if (startBtn) startBtn.disabled = false;
}

startBtn?.addEventListener("click", () => {
  /* Request camera first in this handler — getUserMedia must run during user gesture (no setTimeout). */
  void bootTracking();
  playRadarStartSound();
  startPrimary?.classList.add("hidden");
  navBack.classList.add("hidden-nav");
  flashToScene();
});

function flashToScene() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  const start = performance.now();
  const duration = 500;

  function tick() {
    const t = Math.min((performance.now() - start) / duration, 1);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 * (1 - t)})`;
    ctx.fillRect(0, 0, width, height);
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}

async function bootTracking() {
  hintLayer.classList.remove("hidden");

  handSensorController = await initHandsSensor({
    videoElement: videoEl,
    onReady: () => statusDot.classList.add("active"),
    onHandsDetect: (results) => {
      const hands = results.landmarks;
      if (hands && hands.length > 0) {
        const wrist = hands[0][0];
        const midMcp = hands[0][9];

        const rawX = 1 - (wrist.x + midMcp.x) / 2;
        const rawY = (wrist.y + midMcp.y) / 2;

        const targetX = rawX * width;
        const targetY = rawY * height;

        if (flashlightX === null) {
          flashlightX = targetX;
          flashlightY = targetY;
        } else {
          flashlightX += (targetX - flashlightX) * 0.2;
          flashlightY += (targetY - flashlightY) * 0.2;
        }
      } else {
        flashlightX = null;
        flashlightY = null;
      }
    },
  });

  renderLoop();
}

function drawAttentionPool(fx, fy) {
  const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, ATTENTION_POOL_RADIUS);
  g.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  g.addColorStop(0.4, "rgba(255, 255, 255, 0.14)");
  g.addColorStop(1, "rgba(253, 253, 253, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);

  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  if (flashlightX === null || flashlightY === null) {
    return;
  }

  drawAttentionPool(flashlightX, flashlightY);

  const memoryMaxW = Math.min(300, width * 0.38);
  const lineHeight = 17;

  for (const data of imagesData) {
    const dist = Math.hypot(data.x - flashlightX, data.y - flashlightY);
    const focus = palmFocusFromDistance(dist);

    if (focus <= 0) continue;

    const blurPx = Math.pow(1 - focus, 1.15) * 22;
    const grayPct = (1 - focus) * 92;
    const contrast = 0.72 + focus * 0.55;
    const imageAlpha = 0.12 + Math.pow(focus, 0.85) * 0.88;

    ctx.globalAlpha = imageAlpha;
    ctx.filter = `blur(${blurPx}px) grayscale(${grayPct}%) contrast(${contrast})`;

    ctx.drawImage(
      data.img,
      data.x - data.width / 2,
      data.y - data.height / 2,
      data.width,
      data.height,
    );

    ctx.filter = "none";

    const budget = memoryCharBudget(focus, data.memory.length);
    const snippet = truncateMemoryToWords(data.memory, budget);
    const incomplete =
      snippet.length > 0 && snippet.length < data.memory.length;

    if (snippet.length > 0) {
      const textStrength = Math.pow(Math.max(0.12, focus), 0.95);
      ctx.globalAlpha = imageAlpha * textStrength;
      ctx.font = "13px 'Roboto Mono', monospace";
      ctx.fillStyle = `rgba(28, 32, 38, ${0.78 + 0.2 * focus})`;
      ctx.textAlign = "center";

      const display = incomplete ? `${snippet} …` : snippet;
      const lines = wrapMemoryLines(display, memoryMaxW);
      let ty = data.y + data.height / 2 + 22;
      for (const ln of lines) {
        ctx.fillText(ln, data.x, ty);
        ty += lineHeight;
      }
    }

    ctx.globalAlpha = 1;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initCanvas();
  loadBundledMemories().catch((err) => {
    console.error(err);
    if (loadStatus) {
      loadStatus.textContent =
        "Could not load signals. Add files under public/scouter-memories/ and match names in signal-scouter-page.js.";
    }
  });
});

window.addEventListener("beforeunload", async () => {
  if (handSensorController) await handSensorController.stop();
  if (rafId) cancelAnimationFrame(rafId);
});
