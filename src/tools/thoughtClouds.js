export class ThoughtCloudSystem {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.particles = [];
    this.thoughts = []; // stores original strings just in case
    this.rainDrops = [];
    this.weather = { isRaining: false };
    this._time = 0;

    // Create an offscreen canvas for rendering text to pixels
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.offscreenCanvas.width = this.width;
    this.offscreenCanvas.height = this.height;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;
  }

  setWeather(weather) {
    this.weather = { ...this.weather, ...weather };
  }

  addThought(text, isPermanent = false) {
    this.thoughts.push(text);

    // Clear offscreen canvas
    this.offscreenCtx.clearRect(0, 0, this.width, this.height);

    // Set text style matches matte aesthetic
    if (isPermanent) {
      this.offscreenCtx.font = '500 50px "Synonym-Bold", sans-serif';
      this.offscreenCtx.fillStyle = "rgba(255,255,255,0.95)"; // white
    } else {
      this.offscreenCtx.font = '400 48px "Synonym-Regular", sans-serif';
      this.offscreenCtx.fillStyle = "rgba(255,255,255,0.85)";
    }
    this.offscreenCtx.textAlign = "center";
    this.offscreenCtx.textBaseline = "middle";

    // Add some random variation to where the thought appears, but mostly center-leftish
    const x = this.width * 0.4 + Math.random() * (this.width * 0.2);
    const y = this.height * 0.4 + Math.random() * (this.height * 0.2);

    // Draw the text with multi-line word wrapping
    const fontSize = isPermanent ? 50 : 48;
    const maxWidth = Math.min(this.width * 0.8, 800); // Max width before wrapping
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = this.offscreenCtx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    const lineHeight = fontSize * 1.4;
    let currentY = y - ((lines.length - 1) * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        this.offscreenCtx.fillText(lines[i].trim(), x, currentY);
        currentY += lineHeight;
    }

    // Get image data
    const imageData = this.offscreenCtx.getImageData(
      0,
      0,
      this.width,
      this.height,
    );
    const data = imageData.data;

    // Convert to particles, we skip pixels to lower overhead (e.g., every 3rd pixel)
    const step = 3;
    const newParticles = [];

    for (let py = 0; py < this.height; py += step) {
      for (let px = 0; px < this.width; px += step) {
        const index = (py * this.width + px) * 4;
        const alpha = data[index + 3];

        if (alpha > 50) {
          // If pixel is non-transparent
          newParticles.push({
            x: px,
            y: py,
            origX: px,
            origY: py,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            color: `rgba(${data[index]}, ${data[index + 1]}, ${data[index + 2]}, ${alpha / 255})`,
            life: 1.0,
            active: false, // if true, it's scattering
            r: 0.6 + Math.random() * 1.6, // stable radius (avoid per-frame Math.random)
            phase: Math.random() * Math.PI * 2,
            isPermanent: isPermanent,
          });
        }
      }
    }

    this.particles.push(...newParticles);
  }

  scatter(intensity) {
    // When blow detected, apply wind vector
    this.particles.forEach((p) => {
      if (p.isPermanent) return; // ignore wind for permanent thoughts

      p.active = true;
      const windForceX = intensity * (1.0 + Math.random() * 2.0);
      const windForceY = intensity * (Math.random() - 0.5) * 2.0;

      p.vx += windForceX;
      p.vy += windForceY;
    });
  }

  update(windActive) {
    const now = performance.now();
    const t = now * 0.001;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (p.active) {
        // Move particle
        p.x += p.vx;
        p.y += p.vy;

        // Add curl noise/turbulence approximation
        p.vx += (Math.random() - 0.5) * 0.2;
        p.vy -= 0.05; // smoke effect rises

        // Drag
        p.vx *= 0.98;
        p.vy *= 0.98;

        // Fade out
        p.life -= 0.005; // ~200 frames to disappear completely

        if (
          p.life <= 0 ||
          p.x > this.width ||
          p.x < 0 ||
          p.y > this.height ||
          p.y < 0
        ) {
          this.particles.splice(i, 1);
        }
      } else {
        // Subtle drift for thoughts before blowing
        p.origX += 0.3; // Slow constant drift rightwards like a passing cloud

        if (p.isPermanent) {
          // permanent thoughts slowly dull over time (~5 minutes)
          p.life -= 0.00005;
        }

        // Seamless wrap-around that preserves the text shape
        if (p.origX > this.width + 400) {
          p.origX -= (this.width + 800);
        }

        if (p.life < 0) {
          this.particles.splice(i, 1);
          continue;
        }

        p.x = p.origX + Math.sin(t + p.phase + p.origY * 0.01) * 2;
        p.y = p.origY + Math.cos(t + p.phase + p.origX * 0.01) * 2;
      }
    }

    // Weather Update for Rain
    if (this.weather.isRaining && Math.random() < 0.4) {
      this.rainDrops.push({
        x: Math.random() * this.width,
        y: -10,
        vx: -0.5,
        vy: 12 + Math.random() * 8
      });
    }

    for (let i = this.rainDrops.length - 1; i >= 0; i--) {
      const drop = this.rainDrops[i];
      drop.x += drop.vx;
      drop.y += drop.vy;

      if (drop.y > this.height) {
        this.rainDrops.splice(i, 1);
      }
    }
  }

  render(ctx) {
    if (this.particles.length === 0 && this.rainDrops.length === 0) return;

    if (this.rainDrops.length > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const drop of this.rainDrops) {
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.vx * 1.5, drop.y - drop.vy * 1.5);
      }
      ctx.stroke();
    }

    // Keep draw calls simple and deterministic per particle to reduce CPU spikes.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Update alpha based on life
      ctx.globalAlpha = p.life < 0 ? 0 : p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }
}
