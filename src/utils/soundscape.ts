// Procedural Mesopotamian Evening Soundscape (Lyre of Ur + Desert Breeze + Canal Water)
export class MesopotamianSoundscape {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private masterGain: GainNode | null = null;
  private intervalId: number | null = null;

  // Ancient Mesopotamian / Hurrian diatonic-pentatonic scale frequencies (Hz)
  private readonly scale = [
    146.83, // D3
    164.81, // E3
    196.00, // G3
    220.00, // A3
    246.94, // B3
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
  ];

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public start(): void {
    if (this.isPlaying) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    this.masterGain.gain.exponentialRampToValueAtTime(0.32, this.ctx.currentTime + 1.5);
    this.masterGain.connect(this.ctx.destination);

    // 1. Warm desert wind & distant Euphrates water murmur (filtered pink noise)
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.03;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.4, this.ctx.currentTime);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.22, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.masterGain);
    whiteNoise.start();

    // 2. Deep drone of temple bronzehorn / tambura (D2 = 73.42 Hz)
    const droneOsc = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    droneOsc.type = 'triangle';
    droneOsc.frequency.setValueAtTime(73.42, this.ctx.currentTime);
    droneGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    droneOsc.connect(droneGain);
    droneGain.connect(this.masterGain);
    droneOsc.start();

    // 3. Periodic Sumerian Bull-Lyre (Гусли/Лира Ура) plucks
    this.pluckLyreNote(220.0);
    this.intervalId = window.setInterval(() => {
      if (!this.ctx || !this.isPlaying) return;
      const freq = this.scale[Math.floor(Math.random() * this.scale.length)];
      this.pluckLyreNote(freq);
      if (Math.random() > 0.55) {
        setTimeout(() => {
          if (this.isPlaying) {
            const fifth = freq * 1.5;
            this.pluckLyreNote(fifth > 500 ? freq * 0.75 : fifth, 0.08);
          }
        }, 280);
      }
    }, 1650);

    this.isPlaying = true;
  }

  private pluckLyreNote(freq: number, volume = 0.14): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const noteGain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 2, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 2.4);

    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(volume, now + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(0.0008, now + 3.2);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 3.3);
    subOsc.stop(now + 3.3);
  }

  public stop(): void {
    if (!this.isPlaying) return;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.isPlaying = false;
  }
}
