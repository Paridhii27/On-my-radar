export async function initAudioSensor({ onReady, onBlow, onBlowEnd }) {
  let rafId = null;
  let stream = null;
  let audioContext = null;
  let source = null;
  let analyser = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();

    // Use a smaller FFT size for quicker, less detailed frequency response
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    if (onReady) onReady();

    let isBlowing = false;
    // A threshold to detect typical close-mic "wind" noise.
    // Blowing creates a lot of low-to-mid frequency noise.
    const BLOW_THRESHOLD = 90;

    function detectBlow() {
      analyser.getByteFrequencyData(dataArray);

      // We'll consider the average volume across the lower/mid spectrum
      // Blowing strongly excites the bottom bins (index 0 to ~30)
      let sum = 0;
      let targetBins = 30; // approx up to 2.5kHz
      for (let i = 0; i < targetBins; i++) {
        sum += dataArray[i];
      }
      let average = sum / targetBins;

      if (average > BLOW_THRESHOLD) {
        if (!isBlowing) {
          isBlowing = true;
          // Trigger the blow event with an intensity factor
          const intensity = (average - BLOW_THRESHOLD) / (255 - BLOW_THRESHOLD); // 0 to 1
          if (onBlow) onBlow(intensity);
        }
      } else {
        if (isBlowing) {
          isBlowing = false;
          if (onBlowEnd) onBlowEnd();
        }
      }

      rafId = requestAnimationFrame(detectBlow);
    }

    detectBlow();

    return {
      stop: async () => {
        try {
          if (rafId != null) cancelAnimationFrame(rafId);
          rafId = null;

          try {
            source?.disconnect();
          } catch {}
          try {
            analyser?.disconnect();
          } catch {}

          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
          }

          if (audioContext && audioContext.state !== "closed") {
            await audioContext.close();
          }
          audioContext = null;
          source = null;
          analyser = null;
        } catch (e) {
          console.warn("Failed to stop audio sensor cleanly.", e);
        }
      },
    };
  } catch (err) {
    console.warn("Microphone access denied or not supported.", err);
    return {
      stop: async () => {},
    };
  }
}
