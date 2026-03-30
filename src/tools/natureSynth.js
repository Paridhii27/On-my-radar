export class NatureSynth {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0; // Start muted

    this.modes = ['wind', 'birds', 'water'];
    this.currentModeIndex = 0;
    this.isPlaying = false;
    
    this.zDepth = 0.5; // 0 = Sharp/Close, 1 = Wide/Ambient
    
    // Track active nodes to cleanly dispose them
    this.activeNodes = [];
    this.intervals = [];
    
    // Create base noise buffer needed for wind/water
    this.noiseBuffer = this.createNoiseBuffer();
  }

  async start() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.masterGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.5);
    this.isPlaying = true;
    this.playCurrentMode();
  }

  stop() {
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    this.isPlaying = false;
    setTimeout(() => this.clearEngine(), 600);
  }

  get currentMode() {
    return this.modes[this.currentModeIndex];
  }

  cycleMode() {
    this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
    if (this.isPlaying) {
      this.playCurrentMode();
    }
    return this.currentMode;
  }

  updateDepth(depthVal) {
    // Ensure depth is clamped [0, 1]
    // 0 = Close (sharp/rhythmic), 1 = Far (wide/ambient)
    this.zDepth = Math.max(0, Math.min(1, depthVal));
    this.applyDepthToEngine();
  }

  clearEngine() {
    this.activeNodes.forEach(node => {
      try { node.stop(); } catch (e) {}
      try { node.disconnect(); } catch (e) {}
    });
    this.intervals.forEach(clearInterval);
    this.activeNodes = [];
    this.intervals = [];
    this.engineParams = {}; // store dynamic param references
  }

  playCurrentMode() {
    this.clearEngine();
    const mode = this.currentMode;
    if (mode === 'wind') this.startWind();
    else if (mode === 'birds') this.startBirds();
    else if (mode === 'water') this.startWater();
  }

  applyDepthToEngine() {
    if (!this.isPlaying) return;
    const z = this.zDepth; // 0 (sharp) -> 1 (ambient)
    
    if (this.currentMode === 'wind' && this.engineParams.filter) {
      // Wind: closer = sharp high resonance, far = low deep ambient wash
      const targetFreq = 200 + (1-z) * 1200; // 200Hz ambient -> 1400Hz sharp
      const targetQ = z * 2 + (1-z) * 10;    // lower resonance ambient -> high resonance sharp
      
      this.engineParams.filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      this.engineParams.filter.Q.setTargetAtTime(targetQ, this.ctx.currentTime, 0.1);
    } 
    else if (this.currentMode === 'birds') {
      // Handled via interval speed
    }
    else if (this.currentMode === 'water' && this.engineParams.waterGain) {
      // Water wash vs drops
      // Z=1 (Ambient): Increase continuous washout
      // Z=0 (Sharp): Decrease wash, rely on rhythmic drops
      const washLevel = z * 0.4;
      this.engineParams.waterGain.gain.setTargetAtTime(washLevel, this.ctx.currentTime, 0.2);
    }
  }

  // --- SOUND ENGINES ---

  startWind() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.5;

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    noiseSource.start();
    
    this.activeNodes.push(noiseSource, filter, gainNode);
    this.engineParams.filter = filter;

    // Apply initial depth
    this.applyDepthToEngine();

    // Background random ambient sweeping LFO on the wind
    this.intervals[2] = setInterval(() => {
      if (this.zDepth > 0.5) { // more ambient
        const rFreq = 200 + Math.random() * 400;
        filter.frequency.setTargetAtTime(rFreq, this.ctx.currentTime, 2.0); // slow sweep
      }
    }, 2500);
  }

  startBirds() {
    // Rhythmic chirps
    const chirp = () => {
      // zDepth: 0 (sharp/rhythmic) = fast short chirps. 1 (ambient) = slow, sparse, echoey
      const duration = 0.05 + this.zDepth * 0.15; // 50ms -> 200ms
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      
      // Frequency envelope (chirp down)
      const startFreq = 2000 + Math.random() * 2000;
      const endFreq = startFreq * 0.5;
      
      osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
      
      // Amplitude envelope
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + duration * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
      
      // Schedule next chirp based on depth
      // Close (0) = highly rhythmic/fast. Far (1) = highly ambient/sparse
      const nextTime = 100 + (this.zDepth * 1500) + Math.random() * 800;
      this.intervals[0] = setTimeout(chirp, nextTime);
    };

    chirp();
  }

  startWater() {
    // Ambient running stream wash
    const washSource = this.ctx.createBufferSource();
    washSource.buffer = this.noiseBuffer;
    washSource.loop = true;
    
    const washFilter = this.ctx.createBiquadFilter();
    washFilter.type = 'bandpass';
    washFilter.frequency.value = 500;
    washFilter.Q.value = 1.0;

    const washGain = this.ctx.createGain();
    washGain.gain.value = 0.2; // default

    washSource.connect(washFilter);
    washFilter.connect(washGain);
    washGain.connect(this.masterGain);
    washSource.start();

    this.activeNodes.push(washSource, washFilter, washGain);
    this.engineParams.waterGain = washGain;

    this.applyDepthToEngine();

    // Rhythmic water droplets
    const droplet = () => {
      // When z is 0 (sharp), lots of droplets. When z is 1 (ambient), mostly wash.
      if (Math.random() > this.zDepth) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'sine';
        // Water drop frequency sweep up slightly
        const freq = 400 + Math.random() * 800;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq + 200, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        filter.type = 'highpass';
        filter.frequency.value = 300;
        
        osc.connect(gain);
        gain.connect(filter);
        filter.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
      }
      
      // Speed of droplets based on depth
      const nextTime = 50 + (this.zDepth * 400) + Math.random() * 100;
      this.intervals[1] = setTimeout(droplet, nextTime);
    };
    
    droplet();
  }

  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
