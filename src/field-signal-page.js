import { initHandsSensor } from "./sensors/hands.js";
import { NatureSynth } from "./tools/natureSynth.js";

let handSensorController = null;
let synth = null;
let isStarted = false;

// UI Elements
const videoEl = document.getElementById("webcam");
const camStatusDot = document.getElementById("cam-status-dot");
const canvas = document.getElementById("antenna-canvas");
const ctx = canvas.getContext("2d");
const depthReadout = document.getElementById("depth-readout");
const modeReadout = document.querySelector("#mode-readout strong");
const startBtn = document.getElementById("start-btn");
const fsStartPrimary = document.getElementById("fs-start-primary");
const fsBody = document.querySelector(".page-field-signal");

// Interaction State
const pathHistory = [];
const MAX_PATH_LENGTH = 90; // ~3 seconds of motion memory. Keeps the full circle visible.
let lastGestureTime = 0;
let renderRaf = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

async function toggleSystem() {
  if (isStarted) {
    // Pause
    isStarted = false;
    startBtn.textContent = "Begin Tracking";

    if (synth) synth.stop();
    if (handSensorController) {
      await handSensorController.stop();
      handSensorController = null;
    }
    camStatusDot?.classList.remove("active");
    pathHistory.length = 0;
    if (renderRaf) cancelAnimationFrame(renderRaf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Start
  isStarted = true;
  startBtn.textContent = "Pause Tracking";
  fsStartPrimary?.classList.add("hidden");
  fsBody?.classList.remove("fs-intro-active");

  if (!synth) {
    synth = new NatureSynth();
  }

  /* Camera + MediaPipe and Web Audio must both start in the same user-gesture turn.
     Awaiting synth.start() before initHandsSensor() can drop activation and break getUserMedia. */
  try {
    const [, handsCtl] = await Promise.all([
      synth.start(),
      initHandsSensor({
        videoElement: videoEl,
        onReady: () => camStatusDot?.classList.add("active"),
        onHandsDetect: processDetection,
      }),
    ]);
    handSensorController = handsCtl;
  } catch (err) {
    console.error(err);
    if (synth) synth.stop();
    isStarted = false;
    startBtn.textContent = "Begin Tracking";
    return;
  }

  modeReadout.textContent = synth.currentMode.toUpperCase();

  // Start Render Loop
  if (renderRaf) cancelAnimationFrame(renderRaf);
  renderRaf = requestAnimationFrame(render);
}

function processDetection(results) {
  if (!results.landmarks || results.landmarks.length === 0) {
    // No hands -> fade out path
    if (pathHistory.length > 0) pathHistory.shift();
    return;
  }

  const hand = results.landmarks[0];
  const indexTip = hand[8]; // INDEX_FINGER_TIP
  const wrist = hand[0]; // WRIST
  const midMcp = hand[9]; // MIDDLE_FINGER_MCP

  // Map to screen
  // Mirrored X because webcam is mirrored natively
  const x = (1 - indexTip.x) * canvas.width;
  const y = indexTip.y * canvas.height;

  pathHistory.push({ x, y, t: performance.now() });
  if (pathHistory.length > MAX_PATH_LENGTH) {
    pathHistory.shift();
  }

  // Calculate Z-Depth pseudo-metric via hand scale
  // Distance between wrist and middle MCP in normalized screen space
  const span = Math.sqrt(
    Math.pow(wrist.x - midMcp.x, 2) + Math.pow(wrist.y - midMcp.y, 2),
  );

  // Span is usually ~0.05 (far) to ~0.3 (very close)
  // We want zDepth: 0 (Close/Sharp), 1 (Far/Ambient)
  let zDepth = 1.0 - (span - 0.05) / 0.25;
  zDepth = Math.max(0, Math.min(1, zDepth));

  depthReadout.textContent = zDepth.toFixed(2);
  synth.updateDepth(zDepth);

  // Check Gestures
  detectCircleGesture();
}

function detectCircleGesture() {
  const now = performance.now();
  if (now - lastGestureTime < 1000) return; // cooldown
  if (pathHistory.length < 40) return; // need enough data

  // Calculate Bounding Box and Trajectory Length
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let pathLength = 0;

  for (let i = 0; i < pathHistory.length; i++) {
    const pt = pathHistory[i];
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);

    if (i > 0) {
      const prev = pathHistory[i - 1];
      pathLength += Math.sqrt(
        Math.pow(pt.x - prev.x, 2) + Math.pow(pt.y - prev.y, 2),
      );
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;

  // Check sufficient size
  if (width < 100 || height < 100) return;

  // Check aspect ratio (roughly square)
  const ratio = width / height;
  if (ratio < 0.6 || ratio > 1.6) return;

  // Check open/close gap (start and end points should be somewhat near)
  const startPt = pathHistory[0];
  const endPt = pathHistory[pathHistory.length - 1];
  const gap = Math.sqrt(
    Math.pow(startPt.x - endPt.x, 2) + Math.pow(startPt.y - endPt.y, 2),
  );

  // Gap should be relatively small compared to the radius
  const maxGap = Math.max(width, height) * 0.4;

  if (gap < maxGap) {
    // Check theoretical circumference matching actual drawn length
    const diameter = (width + height) / 2;
    const circumference = Math.PI * diameter;

    // If drawing length is near ideal circumference (allow margin of error for squiggles)
    if (pathLength > circumference * 0.7 && pathLength < circumference * 1.5) {
      // Circle detected!
      lastGestureTime = now;
      const newMode = synth.cycleMode();
      modeReadout.textContent = newMode.toUpperCase();

      // Visual feedback blink
      canvas.style.opacity = 0;
      setTimeout(() => (canvas.style.opacity = 1), 100);
      pathHistory.length = 0; // clear path
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (pathHistory.length > 1) {
    const currentMode = synth ? synth.currentMode : "wind";
    let strokeCol = "rgba(40, 44, 52, 0.4)";
    let fillCol = "rgba(40, 44, 52, 0.8)";
    let ringCol = "rgba(40, 44, 52, 0.15)";

    // Website matching palette mappings
    if (currentMode === "wind") {
      strokeCol = "rgba(163, 177, 198, 0.5)"; // Slate-blue
      fillCol = "rgba(163, 177, 198, 0.9)";
      ringCol = "rgba(163, 177, 198, 0.15)";
    } else if (currentMode === "birds") {
      strokeCol = "rgba(255, 176, 200, 0.5)"; // Soft pink 
      fillCol = "rgba(255, 176, 200, 0.9)";
      ringCol = "rgba(255, 176, 200, 0.15)";
    } else if (currentMode === "water") {
      strokeCol = "rgba(168, 216, 255, 0.5)"; // Soft blue
      fillCol = "rgba(168, 216, 255, 0.9)";
      ringCol = "rgba(168, 216, 255, 0.15)";
    }

    ctx.beginPath();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(pathHistory[0].x, pathHistory[0].y);

    // Draw smooth bezier curve through points
    for (let i = 1; i < pathHistory.length - 2; i++) {
      const xc = (pathHistory[i].x + pathHistory[i + 1].x) / 2;
      const yc = (pathHistory[i].y + pathHistory[i + 1].y) / 2;
      ctx.quadraticCurveTo(pathHistory[i].x, pathHistory[i].y, xc, yc);
    }

    // Draw the last two points
    const last = pathHistory.length - 1;
    ctx.quadraticCurveTo(
      pathHistory[last - 1].x,
      pathHistory[last - 1].y,
      pathHistory[last].x,
      pathHistory[last].y,
    );

    ctx.stroke();

    // Draw glowing "node" at the tip
    const tip = pathHistory[last];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = fillCol;
    ctx.fill();

    // Draw visual tuning ring helper around the gesture
    if (pathHistory.length > 30) {
      let mX = Infinity,
        mXX = -Infinity,
        mY = Infinity,
        mYY = -Infinity;
      for (const pt of pathHistory) {
        if (pt.x < mX) mX = pt.x;
        if (pt.x > mXX) mXX = pt.x;
        if (pt.y < mY) mY = pt.y;
        if (pt.y > mYY) mYY = pt.y;
      }
      const cx = (mX + mXX) / 2;
      const cy = (mY + mYY) / 2;
      const r = Math.max(mXX - mX, mYY - mY) / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw real-time dynamic frequency and volume values floating near the finger tip
    if (synth && synth.isPlaying) {
      const zDepthStr = depthReadout.textContent; // "0.00" to "1.00"
      const currentZ = parseFloat(zDepthStr);
      let readFreq = 0;
      let readVol = 0;

      // Fake readouts loosely based on engine logic for visual indication
      if (synth.currentMode === "wind") {
        readFreq = 200 + (1 - currentZ) * 1200;
        readVol = (0.5 + currentZ * 0.5) * 100;
      } else if (synth.currentMode === "birds") {
        readFreq = 1000 + (1 - currentZ) * 3000;
        readVol = currentZ * 100;
      } else {
        readFreq = 400 + Math.random() * 200;
        readVol = (0.2 + currentZ * 0.8) * 100;
      }

      ctx.font = "bold 11px 'Synonym-Medium', 'Synonym-Regular', sans-serif";
      ctx.fillStyle = "rgba(40, 44, 52, 0.75)";
      ctx.letterSpacing = "1px";
      ctx.padding = "4px";
      ctx.fillText(`FREQ: ${Math.floor(readFreq)} Hz`, tip.x + 16, tip.y - 10);
      ctx.fillText(`VOL:  ${Math.floor(readVol)}%`, tip.x + 16, tip.y + 6);
    }
  }

  if (isStarted) {
    renderRaf = requestAnimationFrame(render);
  }
}

// Boot
startBtn.addEventListener("click", toggleSystem);

window.addEventListener("beforeunload", async () => {
  if (handSensorController) await handSensorController.stop();
  if (synth) synth.stop();
});
