import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** Wait until the video element can render a frame (fixes missed `loadeddata` if already ready). */
function waitForVideoFrame(videoElement) {
  return new Promise((resolve) => {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      videoElement.removeEventListener("loadeddata", onReady);
      videoElement.removeEventListener("canplay", onReady);
      resolve();
    };
    videoElement.addEventListener("loadeddata", onReady);
    videoElement.addEventListener("canplay", onReady);
  });
}

async function createHandLandmarker(vision) {
  const base = {
    modelAssetPath: MODEL_URL,
  };
  try {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { ...base, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  } catch (e) {
    console.warn("HandLandmarker GPU delegate failed, using CPU.", e);
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { ...base, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }
}

/** @param {{ videoElement: HTMLVideoElement; onReady?: () => void; onHandsDetect?: (results: unknown) => void; onError?: (err: unknown) => void }} opts */
export async function initHandsSensor({
  videoElement,
  onReady,
  onHandsDetect,
  onError,
}) {
  let rafId = null;
  let stream = null;
  let handLandmarker = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    videoElement.setAttribute("playsinline", "");
    videoElement.setAttribute("webkit-playsinline", "");
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.srcObject = stream;

    try {
      await videoElement.play();
    } catch (playErr) {
      console.warn("video.play() warning:", playErr);
    }

    await waitForVideoFrame(videoElement);

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
    );

    handLandmarker = await createHandLandmarker(vision);

    let lastVideoTime = -1;
    function predictWebcam() {
      if (!handLandmarker) return;
      if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        rafId = requestAnimationFrame(predictWebcam);
        return;
      }
      if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = handLandmarker.detectForVideo(
          videoElement,
          performance.now(),
        );
        if (onHandsDetect) onHandsDetect(results);
      }
      rafId = requestAnimationFrame(predictWebcam);
    }

    if (onReady) onReady();
    predictWebcam();

    return {
      stop: async () => {
        try {
          if (rafId != null) cancelAnimationFrame(rafId);
          rafId = null;

          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
          }

          try {
            videoElement.pause();
          } catch {}
          videoElement.srcObject = null;

          handLandmarker = null;
        } catch (e) {
          console.warn("Failed to stop hand sensor safely.", e);
        }
      },
    };
  } catch (err) {
    console.error("Camera access denied or MediaPipe Hands failed.", err);
    if (onError) onError(err);
    return { stop: async () => {} };
  }
}
