import { initAudioSensor } from "./sensors/audio.js";
import { ThoughtCloudSystem } from "./tools/thoughtClouds.js";

let canvas, ctx;
let thoughtClouds;
let audioSensorController = null;

const state = {
  width: window.innerWidth,
  height: window.innerHeight,
  windActive: false,
};

async function stopAudioSensorIfRunning() {
  if (!audioSensorController) return;
  try {
    await audioSensorController.stop();
  } finally {
    audioSensorController = null;
    state.windActive = false;
    document.getElementById("mic-status-dot")?.classList.remove("active");
  }
}

async function startAudioSensor() {
  if (audioSensorController) return;
  const micStatusDot = document.getElementById("mic-status-dot");
  audioSensorController = await initAudioSensor({
    onReady: () => micStatusDot?.classList.add("active"),
    onBlow: (intensity) => {
      state.windActive = true;
      thoughtClouds.scatter(intensity);
    },
    onBlowEnd: () => {
      state.windActive = false;
    },
  });
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = state.width;
  canvas.height = state.height;
  if (thoughtClouds) thoughtClouds.resize(state.width, state.height);
}

function loop() {
  ctx.clearRect(0, 0, state.width, state.height);
  thoughtClouds.update(state.windActive);
  thoughtClouds.render(ctx);
  requestAnimationFrame(loop);
}

function applyTimeOfDayTheme() {
  const hour = new Date().getHours();
  let timeClass = "time-day";
  if (hour >= 5 && hour < 8) timeClass = "time-dawn";
  else if (hour >= 8 && hour < 17) timeClass = "time-day";
  else if (hour >= 17 && hour < 19) timeClass = "time-dusk";
  else timeClass = "time-night";

  document.body.classList.remove("time-dawn", "time-day", "time-dusk", "time-night");
  document.body.classList.add(timeClass);
}

/** Call from a user gesture so the browser shows the location permission prompt reliably. */
function requestLocationAndWeather() {
  const fetchWeather = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      );
      const data = await res.json();
      const code = data.current_weather?.weathercode || 0;

      if (code >= 51 && code <= 99) {
        document.body.classList.add("weather-rain");
        if (thoughtClouds && typeof thoughtClouds.setWeather === "function") {
          thoughtClouds.setWeather({ isRaining: true });
        }
      }
    } catch (e) {
      console.error("Weather fetch failed", e);
    }
  };

  if (!("geolocation" in navigator)) {
    console.warn("Geolocation API not supported.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      fetchWeather(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      console.warn("Geolocation denied or failed.", err);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
  );
}

async function init() {
  canvas = document.getElementById("main-canvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");

  resize();
  window.addEventListener("resize", resize);

  thoughtClouds = new ThoughtCloudSystem(state.width, state.height);

  const input = document.getElementById("thought-input");
  if (!input) return;

  applyTimeOfDayTheme();

  let isPermanent = false;
  const toggleBtn = document.getElementById("memory-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      isPermanent = !isPermanent;
      if (isPermanent) {
        toggleBtn.classList.add("permanent");
        input.placeholder = "Type a permanent thought...";
      } else {
        toggleBtn.classList.remove("permanent");
        input.placeholder = "Type a fleeting thought...";
      }
    });
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim() !== "") {
      thoughtClouds.addThought(input.value.trim(), isPermanent);
      input.value = "";
    }
  });

  requestAnimationFrame(loop);

  const permEl = document.getElementById("thought-clouds-permission");
  const permBtn = document.getElementById("thought-clouds-permission-btn");
  const secureHint = document.getElementById("tc-perm-secure-hint");

  if (!window.isSecureContext && secureHint) {
    secureHint.textContent =
      "Microphone and location need a secure context. Use http://localhost or https (opening via a LAN IP over plain HTTP may block these APIs).";
    secureHint.classList.remove("hidden");
  }

  if (permBtn && permEl) {
    permBtn.addEventListener("click", async () => {
      permBtn.disabled = true;
      try {
        await startAudioSensor();
        requestLocationAndWeather();
      } finally {
        permBtn.disabled = false;
        permEl.classList.add("hidden");
      }
    });
  } else {
    await startAudioSensor();
    requestLocationAndWeather();
  }
}

window.addEventListener("beforeunload", () => {
  stopAudioSensorIfRunning();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
