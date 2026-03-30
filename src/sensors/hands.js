import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export async function initHandsSensor({ videoElement, onReady, onHandsDetect }) {
  let rafId = null;
  let stream = null;
  let handLandmarker = null;
  let loadedDataHandler = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    videoElement.srcObject = stream;
    videoElement.muted = true;
    try {
      await videoElement.play();
    } catch {
      /* play() may still be resolving; MediaPipe will read frames when ready */
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2, // support both hands
    });

    loadedDataHandler = () => {
      if (onReady) onReady();
      predictWebcam();
    };
    videoElement.addEventListener("loadeddata", loadedDataHandler);

    let lastVideoTime = -1;
    function predictWebcam() {
      if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = handLandmarker.detectForVideo(
          videoElement,
          performance.now(),
        );

        if (onHandsDetect) {
          onHandsDetect(results);
        }
      }
      rafId = requestAnimationFrame(predictWebcam);
    }

    return {
      stop: async () => {
        try {
          if (rafId != null) cancelAnimationFrame(rafId);
          rafId = null;

          if (loadedDataHandler) {
            videoElement.removeEventListener("loadeddata", loadedDataHandler);
            loadedDataHandler = null;
          }

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
    return { stop: async () => {} };
  }
}
