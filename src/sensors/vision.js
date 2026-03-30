import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export async function initVisionSensor({
  videoElement,
  onReady,
  onFaceDetect,
}) {
  let rafId = null;
  let stream = null;
  let faceLandmarker = null;
  let loadedDataHandler = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    videoElement.srcObject = stream;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
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
        const results = faceLandmarker.detectForVideo(
          videoElement,
          performance.now(),
        );

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const leftBound = results.faceLandmarks[0][234];
          const rightBound = results.faceLandmarks[0][454];

          if (leftBound && rightBound) {
            const width = Math.abs(leftBound.x - rightBound.x);
            if (onFaceDetect) {
              onFaceDetect({
                depth: width,
                landmarks: results.faceLandmarks[0],
              });
            }
          }
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

          faceLandmarker = null;
        } catch (e) {
          console.warn("Failed to stop vision sensor cleanly.", e);
        }
      },
    };
  } catch (err) {
    console.warn("Camera access denied or MediaPipe failed to load.", err);
    return {
      stop: async () => {},
    };
  }
}
