// All sound is synthesized with WebAudio: no audio assets exist. Short oscillator and noise
// blips make the effects (click, hit, skill, ultimate, fanfares), and a tiny step sequencer
// loops a quiet plucked melody over a bass line for music. The context is created lazily on the
// first user gesture, as browsers require, and every method is a safe no-op before that.

const MUTE_KEY = 'ronin-forge-muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicTimer = null;
    this.step = 0;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Create the context (call from a click or key handler) and start the music loop. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* storage unavailable: the toggle still works for this session */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  /** One oscillator note. freq may slide to slideTo over the note's life. */
  tone(freq, dur, opts = {}) {
    if (!this.ctx || this.muted) return;
    const { type = 'sine', vol = 0.15, delay = 0, slideTo = null } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A filtered noise burst, for hits and whooshes. */
  noise(dur, opts = {}) {
    if (!this.ctx || this.muted) return;
    const { vol = 0.2, delay = 0, freq = 1200 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  click() {
    this.tone(660, 0.06, { type: 'square', vol: 0.06 });
    this.tone(990, 0.05, { type: 'square', vol: 0.04, delay: 0.03 });
  }

  hit() {
    this.noise(0.09, { vol: 0.16, freq: 900 });
    this.tone(140, 0.1, { type: 'triangle', vol: 0.14, slideTo: 70 });
  }

  crit() {
    this.noise(0.14, { vol: 0.22, freq: 2000 });
    this.tone(220, 0.16, { type: 'sawtooth', vol: 0.1, slideTo: 60 });
    this.tone(1320, 0.1, { type: 'square', vol: 0.05, delay: 0.02 });
  }

  skill() {
    this.tone(320, 0.22, { type: 'sawtooth', vol: 0.07, slideTo: 880 });
    this.noise(0.18, { vol: 0.08, freq: 2400 });
  }

  ult() {
    this.tone(160, 0.5, { type: 'sawtooth', vol: 0.12, slideTo: 720 });
    this.tone(523, 0.4, { type: 'triangle', vol: 0.1, delay: 0.08 });
    this.tone(659, 0.4, { type: 'triangle', vol: 0.1, delay: 0.16 });
    this.tone(784, 0.55, { type: 'triangle', vol: 0.12, delay: 0.24 });
    this.noise(0.4, { vol: 0.1, freq: 3000, delay: 0.1 });
  }

  heal() {
    this.tone(523, 0.16, { type: 'sine', vol: 0.09 });
    this.tone(659, 0.16, { type: 'sine', vol: 0.09, delay: 0.07 });
    this.tone(784, 0.24, { type: 'sine', vol: 0.09, delay: 0.14 });
  }

  buff() {
    this.tone(392, 0.14, { type: 'triangle', vol: 0.09 });
    this.tone(587, 0.2, { type: 'triangle', vol: 0.09, delay: 0.08 });
  }

  summon() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.11, delay: i * 0.09 }));
    this.noise(0.3, { vol: 0.05, freq: 4000, delay: 0.2 });
  }

  levelup() {
    this.tone(784, 0.1, { type: 'square', vol: 0.06 });
    this.tone(1047, 0.14, { type: 'square', vol: 0.06, delay: 0.07 });
    this.tone(1319, 0.2, { type: 'square', vol: 0.06, delay: 0.14 });
  }

  victory() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.24, { type: 'triangle', vol: 0.11, delay: i * 0.13 }));
  }

  defeat() {
    const notes = [392, 370, 349, 311];
    notes.forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.1, delay: i * 0.16 }));
  }

  /** A quiet 8-step loop: plucked pentatonic melody over a slow bass, scheduled by interval. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const melody = [440, 523, 659, 523, 587, 659, 784, 659, 440, 523, 659, 880, 784, 659, 587, 523];
    const bass = [110, 0, 0, 0, 131, 0, 0, 0, 98, 0, 0, 0, 110, 0, 131, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.step % 16;
      if (bass[i]) this.tone(bass[i], 0.5, { type: 'triangle', vol: 0.055 });
      this.tone(melody[i], 0.22, { type: 'sine', vol: 0.028 });
      if (i % 4 === 2) this.noise(0.03, { vol: 0.012, freq: 6000 });
      this.step += 1;
    }, 235);
  }
}
