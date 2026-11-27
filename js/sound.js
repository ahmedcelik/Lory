// Zero-dependency Web Audio API mechanical switch synthesizer

export class SwitchSound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.profile = 'tactile'; // 'tactile' | 'clicky' | 'linear'
    this.volume = 0.35;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playDown(isLargeKey = false) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = this.volume;

    // 1. Short filtered noise burst (switch actuation click)
    const bufferSize = Math.floor(ctx.sampleRate * 0.022);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq =
      this.profile === 'clicky' ? 3200 : this.profile === 'linear' ? 1400 : 2100;
    filter.frequency.setValueAtTime(
      (isLargeKey ? baseFreq * 0.78 : baseFreq) + (Math.random() * 240 - 120),
      now
    );
    filter.Q.setValueAtTime(this.profile === 'clicky' ? 2.4 : 1.4, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * (this.profile === 'clicky' ? 0.95 : 0.65), now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    // 2. Low-mid housing thock
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    const startPitch = isLargeKey ? 155 : 215;
    osc.frequency.setValueAtTime(startPitch + (Math.random() * 20 - 10), now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.038);

    oscGain.gain.setValueAtTime(vol * 0.55, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.042);
  }
}
