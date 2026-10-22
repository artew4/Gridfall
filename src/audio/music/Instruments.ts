/** Procedural music instruments: every note builds a few short-lived Web Audio nodes at a scheduled time. */

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * One song's mixer strip. Drums go straight to the fader; bass/pads/arps go through a gain that the
 * kick ducks (sidechain pump). A lowpass on the whole strip is used for fade-outs.
 */
export class TrackBus {
  /** Fade-in only (one curve when the track enters). */
  out: GainNode;
  /** Fade-out / cut only, so automation never overlaps a running curve. */
  fader: GainNode;
  /** Emergency cut when a third track would start: never automated otherwise. */
  kill: GainNode;
  filter: BiquadFilterNode;
  drums: GainNode;
  side: GainNode;
  synth: GainNode;
  bass: GainNode;
  lead: GainNode;
  delayIn: GainNode;
  reverbIn: GainNode;
  private delay: DelayNode;

  constructor(ctx: AudioContext, dest: AudioNode, reverb: AudioNode, bpm: number) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.8;
    this.fader = ctx.createGain();
    this.kill = ctx.createGain();
    this.filter.connect(this.fader).connect(this.kill).connect(this.out).connect(dest);
    this.drums = ctx.createGain();
    this.drums.connect(this.filter);
    this.side = ctx.createGain();
    this.side.connect(this.filter);
    this.synth = ctx.createGain();
    this.synth.connect(this.side);
    this.bass = ctx.createGain();
    this.bass.connect(this.side);
    this.lead = ctx.createGain();
    this.lead.connect(this.filter);
    // Tempo-synced dotted-eighth delay for arps and leads.
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = (60 / bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.delayIn = ctx.createGain();
    this.delayIn.connect(this.delay);
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(wet).connect(this.filter);
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(reverb);
  }

  /** Kick-triggered pump on the sustained parts. */
  duck(t: number, depth: number, release: number) {
    const g = this.side.gain;
    g.setValueAtTime(1 - depth, t);
    g.linearRampToValueAtTime(1, t + release);
  }

  disconnect() {
    try {
      this.out.disconnect();
      this.delayIn.disconnect();
      this.reverbIn.disconnect();
    } catch {
      /* already detached */
    }
  }
}

export class Instruments {
  private noise: AudioBuffer;

  constructor(private ctx: AudioContext) {
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Long dark hall shared by all music tracks. */
  makeReverb(dest: AudioNode): AudioNode {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.8);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * Math.min(1, t / 2.2));
        d[i] = lp * Math.exp(-t * 2.2) * Math.min(1, t * 60);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    conv.connect(wet).connect(dest);
    const send = ctx.createGain();
    send.connect(conv);
    return send;
  }

  private env(t: number, peak: number, a: number, d: number, sustain = 0, hold = 0, release = 0.05) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (hold > 0) {
      g.gain.exponentialRampToValueAtTime(Math.max(peak * sustain, 0.0002), t + a + d);
      g.gain.setValueAtTime(Math.max(peak * sustain, 0.0002), t + a + d + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + release);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noiseSrc(t: number, dur: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  private filt(type: BiquadFilterType, f: number, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private drive(amount: number) {
    const ws = this.ctx.createWaveShaper();
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    ws.curve = c;
    return ws;
  }

  // ---------------------------------------------------------------- drums
  kick(bus: TrackBus, t: number, vel = 1, opts: { drive?: number; pump?: number; release?: number; tune?: number } = {}) {
    const tune = opts.tune ?? 1;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160 * tune, t);
    o.frequency.exponentialRampToValueAtTime(48 * tune, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(40 * tune, t + 0.3);
    o.start(t);
    o.stop(t + 0.45);
    const g = this.env(t, 0.95 * vel, 0.002, 0.38);
    let head: AudioNode = g;
    if (opts.drive) {
      const d = this.drive(opts.drive);
      g.connect(d);
      head = d;
    }
    o.connect(g);
    head.connect(bus.drums);
    // Click.
    const n = this.noiseSrc(t, 0.02);
    const hp = this.filt('highpass', 3000);
    n.connect(hp).connect(this.env(t, 0.18 * vel, 0.001, 0.012)).connect(bus.drums);
    if (opts.pump !== 0) bus.duck(t, opts.pump ?? 0.6, opts.release ?? 0.22);
  }

  snare(bus: TrackBus, t: number, vel = 1, tone = 185, reverb = 0.25) {
    const n = this.noiseSrc(t, 0.25);
    const bp = this.filt('bandpass', 1900, 0.8);
    const g = this.env(t, 0.42 * vel, 0.001, 0.18);
    n.connect(bp).connect(g).connect(bus.drums);
    const o = this.osc('triangle', tone, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(tone * 0.7, t + 0.1);
    o.connect(this.env(t, 0.3 * vel, 0.001, 0.09)).connect(bus.drums);
    if (reverb > 0) {
      const s = this.ctx.createGain();
      s.gain.value = reverb * vel;
      g.connect(s).connect(bus.reverbIn);
    }
  }

  clap(bus: TrackBus, t: number, vel = 1) {
    const bp = this.filt('bandpass', 1300, 1.1);
    bp.connect(bus.drums);
    const s = this.ctx.createGain();
    s.gain.value = 0.35;
    bp.connect(s).connect(bus.reverbIn);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const n = this.noiseSrc(tt, i === 2 ? 0.2 : 0.02);
      n.connect(this.env(tt, 0.35 * vel, 0.001, i === 2 ? 0.16 : 0.012)).connect(bp);
    }
  }

  rim(bus: TrackBus, t: number, vel = 1) {
    const o = this.osc('square', 820, t, 0.04);
    const bp = this.filt('bandpass', 1700, 3);
    o.connect(bp).connect(this.env(t, 0.16 * vel, 0.001, 0.035)).connect(bus.drums);
    const s = this.ctx.createGain();
    s.gain.value = 0.6;
    bp.connect(s).connect(bus.reverbIn);
  }

  hat(bus: TrackBus, t: number, vel = 1, open = false) {
    const n = this.noiseSrc(t, open ? 0.35 : 0.05);
    const hp = this.filt('highpass', open ? 6500 : 7800);
    n.connect(hp).connect(this.env(t, (open ? 0.12 : 0.09) * vel, 0.001, open ? 0.28 : 0.035)).connect(bus.drums);
  }

  shaker(bus: TrackBus, t: number, vel = 1) {
    const n = this.noiseSrc(t, 0.08);
    const bp = this.filt('bandpass', 5200, 1.5);
    n.connect(bp).connect(this.env(t, 0.05 * vel, 0.012, 0.05)).connect(bus.drums);
  }

  /** Industrial metal hit: inharmonic partials plus a noise crack. */
  metal(bus: TrackBus, t: number, vel = 1, base = 210) {
    const g = this.ctx.createGain();
    g.gain.value = 1;
    const bp = this.filt('bandpass', 1400, 0.6);
    g.connect(bp).connect(bus.drums);
    const s = this.ctx.createGain();
    s.gain.value = 0.5;
    bp.connect(s).connect(bus.reverbIn);
    [1, 1.43, 2.11, 2.97, 4.23].forEach((r, i) => {
      const o = this.osc('square', base * r, t, 0.4);
      o.connect(this.env(t, (0.08 * vel) / (i + 1), 0.001, 0.25 / (1 + i * 0.4))).connect(g);
    });
    const n = this.noiseSrc(t, 0.12);
    n.connect(this.env(t, 0.3 * vel, 0.001, 0.08)).connect(g);
  }

  tom(bus: TrackBus, t: number, f: number, vel = 1) {
    const o = this.osc('sine', f * 1.6, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(this.env(t, 0.45 * vel, 0.002, 0.25)).connect(bus.drums);
  }

  crash(bus: TrackBus, t: number, vel = 1) {
    const n = this.noiseSrc(t, 2.2);
    const hp = this.filt('highpass', 4200);
    const g = this.env(t, 0.16 * vel, 0.002, 2.0);
    n.connect(hp).connect(g).connect(bus.drums);
    const s = this.ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s).connect(bus.reverbIn);
  }

  /** Noise sweep up into a transition. */
  riser(bus: TrackBus, t0: number, t1: number, vel = 1) {
    const dur = Math.max(0.1, t1 - t0);
    const n = this.noiseSrc(t0, dur);
    const bp = this.filt('bandpass', 300, 2.5);
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t1);
    g.gain.linearRampToValueAtTime(0, t1 + 0.02);
    n.connect(bp).connect(g).connect(bus.drums);
    const s = this.ctx.createGain();
    s.gain.value = 0.6;
    g.connect(s).connect(bus.reverbIn);
  }

  /** Falling noise and pitch: the downlifter that ends a section. */
  downlifter(bus: TrackBus, t: number, dur: number) {
    const n = this.noiseSrc(t, dur);
    const bp = this.filt('bandpass', 5000, 1.5);
    bp.frequency.setValueAtTime(5000, t);
    bp.frequency.exponentialRampToValueAtTime(200, t + dur);
    n.connect(bp).connect(this.env(t, 0.15, 0.02, dur)).connect(bus.drums);
  }

  // ---------------------------------------------------------------- tonal
  /** Two detuned saws and a sub, through an enveloped lowpass. `drive` turns it into a reese. */
  bass(bus: TrackBus, t: number, note: number, dur: number, vel = 1, opts: { cutoff?: number; env?: number; drive?: number; detune?: number } = {}) {
    const f = midi(note);
    const cutoff = opts.cutoff ?? 380;
    const lp = this.filt('lowpass', cutoff, 4);
    lp.frequency.setValueAtTime(cutoff + (opts.env ?? 900), t);
    lp.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(dur, 0.25));
    const g = this.env(t, 0.32 * vel, 0.004, 0.08, 0.75, Math.max(0, dur - 0.08), 0.06);
    const det = opts.detune ?? 9;
    for (const d of [-det, det]) this.osc('sawtooth', f, t, dur + 0.1, d).connect(lp);
    let head: AudioNode = lp;
    if (opts.drive) {
      const ws = this.drive(opts.drive);
      lp.connect(ws);
      head = ws;
    }
    head.connect(g);
    const sub = this.osc('sine', f / 2, t, dur + 0.1);
    sub.connect(this.env(t, 0.42 * vel, 0.004, 0.06, 0.85, Math.max(0, dur - 0.06), 0.05)).connect(bus.bass);
    g.connect(bus.bass);
  }

  /** Warm pad: three saws per voice, slow attack, slowly opening filter. */
  pad(bus: TrackBus, t: number, notes: number[], dur: number, vel = 1, bright = 1400) {
    const lp = this.filt('lowpass', 500, 0.9);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(bright, t + dur * 0.6);
    lp.frequency.linearRampToValueAtTime(700, t + dur + 0.8);
    const g = this.ctx.createGain();
    const peak = (0.05 * vel) / Math.sqrt(notes.length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.7, dur * 0.3));
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.9);
    for (const n of notes) for (const d of [-11, 0, 11]) this.osc('sawtooth', midi(n), t, dur + 1, d).connect(lp);
    lp.connect(g).connect(bus.synth);
    const s = this.ctx.createGain();
    s.gain.value = 0.7;
    g.connect(s).connect(bus.reverbIn);
  }

  /** Short plucked synth through the tempo delay. */
  pluck(bus: TrackBus, t: number, note: number, vel = 1, opts: { type?: OscillatorType; cutoff?: number; decay?: number; delay?: number } = {}) {
    const lp = this.filt('lowpass', 600, 5);
    const cut = opts.cutoff ?? 3200;
    lp.frequency.setValueAtTime(cut, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + (opts.decay ?? 0.18));
    const o = this.osc(opts.type ?? 'square', midi(note), t, 0.3);
    const g = this.env(t, 0.07 * vel, 0.002, opts.decay ?? 0.22);
    o.connect(lp).connect(g).connect(bus.synth);
    const s = this.ctx.createGain();
    s.gain.value = opts.delay ?? 0.5;
    g.connect(s).connect(bus.delayIn);
  }

  /** Chord stab: short and bright. */
  stab(bus: TrackBus, t: number, notes: number[], vel = 1) {
    const lp = this.filt('lowpass', 900, 2);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.15);
    const g = this.env(t, (0.08 * vel) / Math.sqrt(notes.length), 0.003, 0.2);
    for (const n of notes) for (const d of [-8, 8]) this.osc('sawtooth', midi(n), t, 0.3, d).connect(lp);
    lp.connect(g).connect(bus.synth);
    const s = this.ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s).connect(bus.delayIn);
  }

  /** Lead with glide and delayed vibrato. */
  lead(bus: TrackBus, t: number, note: number, dur: number, vel = 1, opts: { from?: number; glide?: number; type?: OscillatorType; cutoff?: number; vibrato?: number } = {}) {
    const f = midi(note);
    const lp = this.filt('lowpass', opts.cutoff ?? 2600, 1.5);
    const g = this.env(t, 0.075 * vel, 0.02, 0.2, 0.8, Math.max(0, dur - 0.2), 0.18);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.6;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006 * (opts.vibrato ?? 1), t + Math.min(0.5, dur * 0.6));
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur + 0.3);
    for (const [type, det] of [[opts.type ?? 'sawtooth', -6], ['square', 6]] as [OscillatorType, number][]) {
      const o = this.osc(type, opts.from ? midi(opts.from) : f, t, dur + 0.25, det);
      if (opts.from) o.frequency.exponentialRampToValueAtTime(f, t + (opts.glide ?? 0.08));
      vg.connect(o.frequency);
      o.connect(lp);
    }
    lp.connect(g).connect(bus.lead);
    const d = this.ctx.createGain();
    d.gain.value = 0.35;
    g.connect(d).connect(bus.delayIn);
    const r = this.ctx.createGain();
    r.gain.value = 0.5;
    g.connect(r).connect(bus.reverbIn);
  }

  // ---------------------------------------------------------------- 25.0: the jungle's drums and drones, the desert's voices
  /**
   * A deep tribal drum (25.0, the jungle): a sine thump falling from 2.2× its pitch to `f` (45–90 Hz
   * for the big drums), a long body, and a short low-passed slap of the skin. Nothing over ~1 kHz.
   */
  tribal(bus: TrackBus, t: number, f: number, vel = 1, opts: { decay?: number; slap?: number } = {}) {
    const decay = opts.decay ?? 0.55;
    const o = this.osc('sine', f * 2.2, t, decay + 0.1);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    o.connect(this.env(t, 0.6 * vel, 0.003, decay)).connect(bus.drums);
    // The body's second partial (a drum, not a sine).
    const o2 = this.osc('sine', f * 1.6, t, decay * 0.6);
    o2.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07);
    o2.connect(this.env(t, 0.16 * vel, 0.003, decay * 0.5)).connect(bus.drums);
    const slap = opts.slap ?? 0.25;
    if (slap > 0) {
      const n = this.noiseSrc(t, 0.06);
      n.connect(this.filt('lowpass', 900, 0.8)).connect(this.env(t, slap * vel, 0.001, 0.05)).connect(bus.drums);
    }
    const r = this.ctx.createGain();
    r.gain.value = 0.25;
    o.connect(r).connect(bus.reverbIn);
  }

  /**
   * A drone (25.0): two detuned saws and a sub under a low-pass that breathes (an LFO on the cutoff,
   * `rate` Hz), with a slow swell in and out. For the jungle's floor and the desert's tanpura.
   */
  drone(bus: TrackBus, t: number, note: number, dur: number, vel = 1, opts: { cutoff?: number; depth?: number; rate?: number; detune?: number } = {}) {
    const f = midi(note);
    const cutoff = opts.cutoff ?? 180;
    const lp = this.filt('lowpass', cutoff, 1.2);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = opts.rate ?? 0.12;
    const lg = this.ctx.createGain();
    lg.gain.value = cutoff * (opts.depth ?? 0.5);
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 1.6);
    const g = this.ctx.createGain();
    const peak = 0.12 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(1.5, dur * 0.3));
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
    const det = opts.detune ?? 7;
    for (const d of [-det, det]) this.osc('sawtooth', f, t, dur + 1.6, d).connect(lp);
    this.osc('sine', f / 2, t, dur + 1.6).connect(g);
    lp.connect(g).connect(bus.bass);
    const r = this.ctx.createGain();
    r.gain.value = 0.3;
    g.connect(r).connect(bus.reverbIn);
  }

  /**
   * A ney-like flute (25.0, the desert): a sine and a soft triangle an octave up, breath (noise
   * band-passed at the note), a slow vibrato that comes in late; `from` slides into the note (the
   * maqam ornament).
   */
  flute(bus: TrackBus, t: number, note: number, dur: number, vel = 1, opts: { from?: number; glide?: number } = {}) {
    const f = midi(note);
    const g = this.env(t, 0.07 * vel, 0.07, 0.25, 0.85, Math.max(0, dur - 0.25), 0.25);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.6, dur * 0.7));
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur + 0.4);
    for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 2, 0.18]] as [OscillatorType, number, number][]) {
      const o = this.osc(type, (opts.from ? midi(opts.from) : f) * mul, t, dur + 0.3);
      if (opts.from) o.frequency.exponentialRampToValueAtTime(f * mul, t + (opts.glide ?? 0.12));
      vg.connect(o.frequency);
      const og = this.ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
    }
    const n = this.noiseSrc(t, dur + 0.3);
    const bp = this.filt('bandpass', f * 1.5, 2.2);
    n.connect(bp).connect(this.env(t, 0.035 * vel, 0.05, 0.2, 0.5, Math.max(0, dur - 0.2), 0.2)).connect(bus.lead);
    g.connect(bus.lead);
    const r = this.ctx.createGain();
    r.gain.value = 0.55;
    g.connect(r).connect(bus.reverbIn);
  }

  /**
   * A bowed string (25.0, the desert's kamancheh/rebab ensemble): detuned saws through a low-pass and
   * a body formant, a slow bow attack, vibrato; `from` slides into the note.
   */
  bowed(bus: TrackBus, t: number, note: number, dur: number, vel = 1, opts: { from?: number; glide?: number; voices?: number } = {}) {
    const f = midi(note);
    const lp = this.filt('lowpass', 2200, 0.8);
    const body = this.filt('peaking', 1100, 1.2);
    body.gain.value = 5;
    const g = this.env(t, 0.06 * vel, 0.14, 0.3, 0.8, Math.max(0, dur - 0.3), 0.3);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.8;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.5, dur * 0.6));
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur + 0.4);
    const voices = opts.voices ?? 3;
    for (let i = 0; i < voices; i++) {
      const det = (i - (voices - 1) / 2) * 7;
      const o = this.osc('sawtooth', opts.from ? midi(opts.from) : f, t, dur + 0.35, det);
      if (opts.from) o.frequency.exponentialRampToValueAtTime(f, t + (opts.glide ?? 0.15));
      vg.connect(o.frequency);
      o.connect(lp);
    }
    lp.connect(body).connect(g).connect(bus.lead);
    const r = this.ctx.createGain();
    r.gain.value = 0.6;
    g.connect(r).connect(bus.reverbIn);
  }

  /** A darbuka (25.0, the desert): `dum` (low, open), `tek` (the rim, bright and dry), `ka` (a softer tek). */
  darbuka(bus: TrackBus, t: number, stroke: 'dum' | 'tek' | 'ka', vel = 1) {
    if (stroke === 'dum') {
      const o = this.osc('sine', 150, t, 0.35);
      o.frequency.exponentialRampToValueAtTime(82, t + 0.06);
      o.connect(this.env(t, 0.55 * vel, 0.002, 0.3)).connect(bus.drums);
      return;
    }
    const k = stroke === 'tek' ? 1 : 0.55;
    const n = this.noiseSrc(t, 0.05);
    n.connect(this.filt('bandpass', 3400, 1.4)).connect(this.env(t, 0.32 * vel * k, 0.0008, 0.04)).connect(bus.drums);
    const o = this.osc('triangle', 620, t, 0.06);
    o.connect(this.env(t, 0.12 * vel * k, 0.001, 0.05)).connect(bus.drums);
  }
}
