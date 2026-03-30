const MOVE_MS_MIN = 1800;
const MOVE_MS_MAX = 4200;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function placeBlip() {
  const blip = document.getElementById("radar-blip");
  if (!blip) return;

  const angle = Math.random() * Math.PI * 2;
  const radiusNorm = randomBetween(0.08, 0.42);
  const x = 50 + Math.cos(angle) * radiusNorm * 100;
  const y = 50 + Math.sin(angle) * radiusNorm * 100;

  blip.style.left = `${x}%`;
  blip.style.top = `${y}%`;
}

function scheduleNext() {
  const delay = randomBetween(MOVE_MS_MIN, MOVE_MS_MAX);
  window.setTimeout(() => {
    placeBlip();
    scheduleNext();
  }, delay);
}

function init() {
  placeBlip();
  scheduleNext();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
