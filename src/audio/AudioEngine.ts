import * as THREE from 'three';
import { rand } from '../core/math';
import type { GunSound } from '../entities/types';
import { pumpLayers, reloadRecipe, type Layer, type ReloadKind, type ReloadStage } from './ReloadSynth';

type V3 = { x: number; y: number; z: number };

/**
 * Everything audible is synthesised here with Web Audio: rain beds, neon hum, sirens,
 * a layered gunshot through a procedurally generated "narrow alley" reverb, footsteps and UI cues.
 */
export type VolumeGroup = 'master' | 'music' | 'sfx';

export class AudioEngine {
  ctx!: AudioContext;
  started = false;
  /** Music plugs in here: after the volume group, before the master (never muffled by damage). */
  musicIn!: GainNode;
  private volumes: Record<VolumeGroup, number> = { master: 0.8, music: 0.6, sfx: 0.85 };
  private muted = false;
  private masterVol!: GainNode;
  private musicVol!: GainNode;
  private sfxVol!: GainNode;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private ui!: GainNode;
  private reverbSend!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;
  private dripTimer = 0;
  private sirenTimer = 18;
  private carTimer = 6;
  private hornTimer = 11;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private under = -1;
  /**
   * Everything the loaded level keeps playing (ambience beds, hums, loops, rumble) goes through this
   * bus, and its sources are tracked, so a level switch can stop and disconnect all of it.
   */
  private levelBus!: GainNode;
  private levelNodes: AudioScheduledSourceNode[] = [];
  /** Which ambience the level asked for: drives the random events in update(). */
  private ambience: 'city' | 'city-dry' | 'desert' | 'jungle' | 'harbour' | 'terminal' | null = null;
  private birdTimer = 3;
  private frogTimer = 2;
  private monkeyTimer = 25;
  private leafDripTimer = 1;
  private insects: GainNode | null = null;
  private wind: { filter: BiquadFilterNode; gain: GainNode; hiss: GainNode; howl: BiquadFilterNode } | null = null;
  private creakTimer = 9;
  private flapTimer = 5;
  private rumble: { g: GainNode; lp: BiquadFilterNode; whine: OscillatorNode; wg: GainNode } | null = null;
  private hums: { gain: GainNode; base: number }[] = [];

  start() {
    if (this.started) {
      void this.ctx.resume();
      return;
    }
    this.started = true;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    // Graph: [sfx, amb, reverb] → muffle → sfxVol ─┐
    //                                       ui → sfxVol ├→ compressor → fade-in → masterVol → out
    //                                 musicIn → musicVol ┘
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    this.masterVol = ctx.createGain();
    this.musicVol = ctx.createGain();
    this.sfxVol = ctx.createGain();
    this.musicIn = ctx.createGain();
    comp.connect(this.master).connect(this.masterVol).connect(ctx.destination);
    this.muffle.connect(this.sfxVol).connect(comp);
    this.musicIn.connect(this.musicVol).connect(comp);
    this.applyVolumes(true);

    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.ui = ctx.createGain();
    this.sfx.connect(this.muffle);
    this.amb.connect(this.muffle);
    this.ui.connect(this.sfxVol);

    // Alley reverb: convolver with discrete wall reflections, plus a short slapback echo.
    const conv = ctx.createConvolver();
    conv.buffer = this.alleyImpulse();
    const slap = ctx.createDelay(1);
    slap.delayTime.value = 0.14;
    const slapFb = ctx.createGain();
    slapFb.gain.value = 0.28;
    const slapLp = ctx.createBiquadFilter();
    slapLp.type = 'lowpass';
    slapLp.frequency.value = 2200;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbSend.connect(conv).connect(wet).connect(this.muffle);
    this.reverbSend.connect(slap);
    slap.connect(slapLp).connect(slapFb).connect(slap);
    const slapOut = ctx.createGain();
    slapOut.gain.value = 0.35;
    slapLp.connect(slapOut).connect(this.muffle);

    this.white = this.noiseBuffer('white');
    this.pink = this.noiseBuffer('pink');
    this.brown = this.noiseBuffer('brown');
    this.levelBus = ctx.createGain();
    this.levelBus.connect(this.amb);
  }

  /** A looping source that belongs to the loaded level (stopped by clearLevel). */
  private levelSrc<T extends AudioScheduledSourceNode>(n: T): T {
    this.levelNodes.push(n);
    return n;
  }

  /** Stops and disconnects every sound the loaded level started (level switch). */
  clearLevel() {
    if (!this.started) return;
    for (const n of this.levelNodes) {
      try {
        n.stop();
      } catch {
        /* never started or already stopped */
      }
      n.disconnect();
    }
    this.levelNodes = [];
    this.levelBus.disconnect();
    this.levelBus = this.ctx.createGain();
    this.levelBus.connect(this.amb);
    this.rainFilter = this.rainGain = null;
    this.rumble = null;
    this.wind = null;
    this.insects = null;
    this.hums = [];
    this.under = -1;
    this.ambience = null;
    this.reverbSend.gain.setTargetAtTime(1, this.now(), 0.1);
  }

  /** Ambience profile of the loaded level: the beds and the random events around the listener. */
  setAmbience(kind: 'city' | 'city-dry' | 'desert' | 'jungle' | 'harbour' | 'terminal') {
    if (!this.started || this.ambience === kind) return;
    this.ambience = kind;
    if (kind === 'city') this.startAmbience();
    // 25.0: Neon Block after the rain: the city's rumble without the rain bed.
    else if (kind === 'city-dry') this.startAmbience(false);
    else if (kind === 'jungle') this.startJungle();
    else if (kind === 'harbour') this.startHarbour();
    else if (kind === 'terminal') this.startTerminal();
    else this.startDesert();
  }

  /** Slider value 0..1 → gain (squared for a more even perceived taper). */
  setVolume(group: VolumeGroup, v: number) {
    this.volumes[group] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
  }

  private ducked = false;
  /** Dialogue on screen: the music steps back a little (about -5 dB), smoothly. */
  duckMusic(on: boolean) {
    if (!this.started || on === this.ducked) return;
    this.ducked = on;
    this.musicIn.gain.setTargetAtTime(on ? 0.56 : 1, this.ctx.currentTime, 0.6);
  }

  /** New objective: a soft two-note chime; objective complete: a rising third first. */
  objective(completed: boolean) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const notes = completed ? [659.3, 830.6, 987.8] : [740, 987.8];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const at = t + i * 0.11;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.07, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.9);
      o.connect(g).connect(this.ui);
      o.start(at);
      o.stop(at + 0.95);
    });
  }

  /** Hidden tab: stop the audio thread entirely (nothing plays, nothing is computed). */
  setSuspended(on: boolean) {
    if (!this.started) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  private applyVolumes(instant = false) {
    if (!this.started) return;
    const t = this.now();
    const set = (g: GainNode, v: number) => {
      if (instant) g.gain.value = v;
      else g.gain.setTargetAtTime(v, t, 0.03);
    };
    set(this.masterVol, this.muted ? 0 : this.volumes.master ** 2);
    set(this.musicVol, this.volumes.music ** 2);
    set(this.sfxVol, this.volumes.sfx ** 2);
  }

  private noiseBuffer(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  private alleyImpulse(): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 1.8);
    const buf = this.ctx.createBuffer(2, len, sr);
    const taps = [0.009, 0.019, 0.031, 0.044, 0.058, 0.077, 0.096, 0.121, 0.15];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      taps.forEach((t, i) => {
        const idx = Math.floor((t + ch * 0.003 * (i % 3)) * sr);
        d[idx] += (i % 2 ? -1 : 1) * 0.7 * Math.pow(0.82, i);
      });
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (0.5 - 0.35 * Math.min(1, t / 1.2)); // darker as it decays
        d[i] += lp * Math.exp(-t * 3.2) * 0.35 * Math.min(1, t * 40);
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ helpers
  private now() {
    return this.ctx.currentTime;
  }

  private noise(buf: AudioBuffer, loop = false, offset = Math.random() * 2, at = this.now()) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.start(at, offset);
    return s;
  }

  private gainEnv(peak: number, attack: number, decay: number, t = this.now()) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private osc(type: OscillatorType, f0: number, f1: number, dur: number, t = this.now()) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** Output node for a sound: positional panner (if pos), with a reverb send. */
  private out(pos: V3 | null, send = 0.3, bus: GainNode = this.sfx): AudioNode {
    const g = this.ctx.createGain();
    let head: AudioNode = g;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5;
      p.rolloffFactor = 1.1;
      p.maxDistance = 120;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      g.connect(p);
      p.connect(bus);
      head = g;
      if (send > 0) {
        const s = this.ctx.createGain();
        s.gain.value = send;
        p.connect(s).connect(this.reverbSend);
      }
    } else {
      g.connect(bus);
      if (send > 0) {
        const s = this.ctx.createGain();
        s.gain.value = send;
        g.connect(s).connect(this.reverbSend);
      }
    }
    setTimeout(() => g.disconnect(), 4000);
    return head;
  }

  private burst(dest: AudioNode, buf: AudioBuffer, ftype: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, t = this.now(), freqEnd?: number) {
    // 26.0: started at `t`, not now. A gain sits at its default (1) until its first event, so a burst
    // scheduled ahead played its noise at full level, unfiltered by the envelope, until it began.
    const src = this.noise(buf, false, Math.random() * 2, t);
    const f = this.filter(ftype, freq, q);
    if (freqEnd) {
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    }
    const g = this.gainEnv(peak, attack, decay, t);
    src.connect(f).connect(g).connect(dest);
    src.stop(t + attack + decay + 0.05);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, t = this.now()) {
    const o = this.osc(type, f0, f1, attack + decay, t);
    const g = this.gainEnv(peak, attack, decay, t);
    o.connect(g).connect(dest);
  }

  private metal(dest: AudioNode, base: number, peak: number, decay: number, ratios = [1, 2.32, 4.25, 6.63], t = this.now()) {
    ratios.forEach((r, i) => this.tone(dest, 'sine', base * r, base * r * 0.995, peak / (i + 1), 0.002, decay / (1 + i * 0.5), t));
  }

  // ------------------------------------------------------------------ ambience
  private startAmbience(rain = true) {
    const ctx = this.ctx;
    const layer = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, gain: number) => {
      const s = this.levelSrc(this.noise(buf, true));
      const fl = this.filter(type, f, q);
      const g = ctx.createGain();
      g.gain.value = gain;
      s.connect(fl).connect(g).connect(this.levelBus);
      return g;
    };
    // Distant city rumble.
    if (!rain) {
      layer(this.brown, 'lowpass', 160, 0.5, 0.4);
      layer(this.pink, 'bandpass', 300, 0.4, 0.06);
      return;
    }
    // Rain: body, hiss, mid patter with slow swell. All through one filter so it can go muffled underground.
    const rainFilter = this.filter('lowpass', 20000);
    this.rainFilter = rainFilter;
    this.rainGain = ctx.createGain();
    rainFilter.connect(this.rainGain).connect(this.levelBus);
    const rainLayer = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, gain: number) => {
      const g = layer(buf, type, f, q, gain);
      g.disconnect();
      g.connect(rainFilter);
      return g;
    };
    rainLayer(this.pink, 'lowpass', 1400, 0.5, 0.55);
    rainLayer(this.white, 'highpass', 4500, 0.5, 0.06);
    const patter = rainLayer(this.white, 'bandpass', 900, 0.6, 0.1);
    const lfo = this.levelSrc(ctx.createOscillator());
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(patter.gain);
    lfo.start();
    // Distant city rumble.
    layer(this.brown, 'lowpass', 160, 0.5, 0.35);
    layer(this.pink, 'bandpass', 300, 0.4, 0.05);
  }

  /**
   * Desert wind: a low gusting body, a howl whose pitch wanders, and a hiss of blowing sand, all
   * through one filter so the inside of a building muffles them. Strength follows the storm.
   */
  private startDesert() {
    const ctx = this.ctx;
    const filter = this.filter('lowpass', 20000);
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    filter.connect(gain).connect(this.levelBus);
    const bed = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, level: number) => {
      const src = this.levelSrc(this.noise(buf, true));
      const fl = this.filter(type, f, q);
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(fl).connect(g).connect(filter);
      return { g, fl };
    };
    const body = bed(this.brown, 'lowpass', 220, 0.6, 0.9);
    const howl = bed(this.pink, 'bandpass', 420, 4, 0.5);
    const hiss = bed(this.white, 'highpass', 2600, 0.5, 0.0);
    // Gusts: two slow, unrelated LFOs on the body level and the howl pitch.
    const gust = this.levelSrc(ctx.createOscillator());
    gust.frequency.value = 0.11;
    const gg = ctx.createGain();
    gg.gain.value = 0.45;
    gust.connect(gg).connect(body.g.gain);
    gust.start();
    const wander = this.levelSrc(ctx.createOscillator());
    wander.frequency.value = 0.043;
    const wg = ctx.createGain();
    wg.gain.value = 160;
    wander.connect(wg).connect(howl.fl.frequency);
    wander.start();
    this.wind = { filter, gain, hiss: hiss.g, howl: howl.fl };
    // Open air: little reverb outdoors.
    this.reverbSend.gain.setTargetAtTime(0.3, this.now(), 0.2);
  }

  /**
   * Jungle beds: a warm, damp air loop (filtered noise that breathes slowly), a cicada drone (two
   * narrow noise bands amplitude-modulated into a buzz, swelling and fading in long waves) and a
   * low distant hum of the forest. Birds, frogs, drips and the odd howler monkey come from update().
   */
  private startJungle() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.32;
    bus.connect(this.levelBus);
    const bed = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, level: number, dest: AudioNode = bus) => {
      const src = this.levelSrc(this.noise(buf, true));
      const fl = this.filter(type, f, q);
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(fl).connect(g).connect(dest);
      return { g, fl };
    };
    const lfo = (freq: number, depth: number, target: AudioParam) => {
      const o = this.levelSrc(ctx.createOscillator());
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
    };
    // Humid air: soft low noise, breathing.
    const air = bed(this.pink, 'lowpass', 520, 0.5, 0.55);
    lfo(0.07, 0.18, air.g.gain);
    bed(this.brown, 'lowpass', 140, 0.7, 0.5);
    // Insects: the buzz is the band's level wobbling fast (~28 Hz), the swell a slow LFO on top.
    const insects = ctx.createGain();
    insects.gain.value = 0.35;
    const swell = ctx.createGain();
    swell.gain.value = 0.7;
    insects.connect(swell).connect(bus);
    for (const [f, rate, level] of [[4300, 27, 0.32], [6100, 33, 0.2], [2900, 19, 0.12]] as const) {
      const band = bed(this.white, 'bandpass', f, 9, level, insects);
      lfo(rate, level * 0.9, band.g.gain);
    }
    lfo(0.045, 0.3, swell.gain);
    this.insects = insects;
    // Open forest: some reverb (the trees), less than the city's alleys.
    this.reverbSend.gain.setTargetAtTime(0.5, this.now(), 0.2);
  }

  /**
   * 17.0, a harbour in daylight: the desert's wind chain at a breeze (so setWind still muffles it
   * indoors), the sea washing against the quay (low noise breathing on a slow swell), and from
   * update() gulls, a far ship's horn and a chain clinking on a mooring.
   */
  private startHarbour() {
    this.startDesert();
    const ctx = this.ctx;
    const w = this.wind!;
    const src = this.levelSrc(this.noise(this.pink, true));
    const fl = this.filter('lowpass', 520, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(fl).connect(g).connect(w.filter);
    const swell = this.levelSrc(ctx.createOscillator());
    swell.frequency.value = 0.12;
    const sg = ctx.createGain();
    sg.gain.value = 0.35;
    swell.connect(sg).connect(g.gain);
    swell.start();
    this.reverbSend.gain.setTargetAtTime(0.35, this.now(), 0.2);
  }

  /**
   * 18.0, the terminal: a glass hall. The wind bed (kept for the level's setWind, near silent under
   * glass), an air-handling hum (a low band of brown noise and a faint 100 Hz drone), a long reverb.
   */
  private startTerminal() {
    this.startDesert();
    const ctx = this.ctx;
    const w = this.wind!;
    const src = this.levelSrc(this.noise(this.brown, true));
    const fl = this.filter('bandpass', 140, 1.2);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(fl).connect(g).connect(this.levelBus);
    const drone = this.levelSrc(ctx.createOscillator());
    drone.type = 'sine';
    drone.frequency.value = 100;
    const dg = ctx.createGain();
    dg.gain.value = 0.006;
    drone.connect(dg).connect(this.levelBus);
    drone.start();
    w.gain.gain.value = 0.15;
    this.reverbSend.gain.setTargetAtTime(0.7, this.now(), 0.2);
  }

  private chimeTimer = 12;
  private passTimer = 30;

  /** Terminal events: the announcement chime (three notes, far up in the hall), a train passing outside. */
  private updateTerminal(dt: number, l: V3) {
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.chimeTimer = rand(28, 60);
      const o = this.out({ x: l.x + rand(-20, 20), y: 12, z: l.z + rand(-30, 30) }, 0.8, this.amb);
      const t = this.now();
      [659.3, 830.6, 987.8].forEach((f, i) => {
        this.tone(o, 'sine', f, f, 0.03, 0.01, 1.4, t + i * 0.42);
        this.tone(o, 'sine', f * 2, f * 2, 0.006, 0.01, 0.8, t + i * 0.42);
      });
    }
    this.passTimer -= dt;
    if (this.passTimer <= 0) {
      this.passTimer = rand(50, 100);
      // A maglev passing beyond the glass: a filtered rush that swells and fades over 6 s.
      const o = this.out({ x: l.x + (Math.random() < 0.5 ? -60 : 60), y: 4, z: l.z }, 0.6, this.amb);
      const t = this.now();
      const src = this.noise(this.pink, true);
      const bp = this.filter('bandpass', 380, 0.8);
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.linearRampToValueAtTime(620, t + 3);
      bp.frequency.linearRampToValueAtTime(240, t + 6);
      const env = this.gainEnv(0.12, 2.6, 3.4, t);
      src.connect(bp).connect(env).connect(o);
      src.stop(t + 6.2);
    }
  }

  private gullTimer = 3;
  private hornFarTimer = 25;
  private clinkTimer = 6;

  /** Harbour events around the listener: gulls overhead, a ship's horn far out, a chain on a bollard. */
  private updateHarbour(dt: number, l: V3) {
    const around = (d0: number, d1: number, y0: number, y1: number) => {
      const a = rand(0, Math.PI * 2);
      const d = rand(d0, d1);
      return { x: l.x + Math.cos(a) * d, y: rand(y0, y1), z: l.z + Math.sin(a) * d };
    };
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = rand(4, 11);
      const o = this.out(around(15, 45, 12, 25), 0.3, this.amb);
      const t = this.now();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const f = rand(1300, 1700), t0 = t + i * rand(0.28, 0.42);
        this.tone(o, 'triangle', f, f * 1.45, 0.035, 0.02, 0.12, t0);
        this.tone(o, 'sine', f * 1.45, f * 0.8, 0.03, 0.01, 0.2, t0 + 0.1);
      }
    }
    this.hornFarTimer -= dt;
    if (this.hornFarTimer <= 0) {
      this.hornFarTimer = rand(45, 90);
      const o = this.out({ x: l.x + 260, y: 10, z: l.z + rand(-80, 80) }, 0.7, this.amb);
      const t = this.now();
      for (const [f, k] of [[98, 1], [123.5, 0.6]] as const) {
        const src = this.osc('sawtooth', f, f, 3.2, t);
        const lp = this.filter('lowpass', 420, 0.7);
        const env = this.gainEnv(0.07 * k, 0.4, 2.6, t);
        src.connect(lp).connect(env).connect(o);
      }
    }
    this.clinkTimer -= dt;
    if (this.clinkTimer <= 0) {
      this.clinkTimer = rand(5, 14);
      const o = this.out(around(5, 20, 0, 2), 0.1, this.amb);
      const t = this.now();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.metal(o, rand(1800, 2600), 0.02, 0.18, [1, 2.4, 4.1], t + i * rand(0.09, 0.16));
    }
  }

  /** Jungle events around the listener: bird calls, frog croaks, water dripping off leaves, a howler monkey. */
  private updateJungle(dt: number, l: V3) {
    const around = (d0: number, d1: number, y0: number, y1: number) => {
      const a = rand(0, Math.PI * 2);
      const d = rand(d0, d1);
      return { x: l.x + Math.cos(a) * d, y: rand(y0, y1), z: l.z + Math.sin(a) * d };
    };
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(1.5, 5);
      const o = this.out(around(10, 40, 6, 18), 0.25, this.amb);
      const t = this.now();
      const kind = Math.random();
      if (kind < 0.4) {
        // A whistled phrase: 2–4 rising-falling notes.
        const base = rand(1800, 3200);
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(o, 'sine', base * rand(0.9, 1.25), base * rand(0.7, 1.1), 0.05, 0.01, 0.12, t + i * rand(0.14, 0.22));
      } else if (kind < 0.75) {
        // Rapid chips.
        const base = rand(3500, 5200);
        const n = 4 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) this.tone(o, 'triangle', base, base * 0.8, 0.03, 0.002, 0.03, t + i * 0.065);
      } else {
        // A long descending call (a cuckoo-ish two-note or a falling whistle).
        const base = rand(900, 1400);
        this.tone(o, 'sine', base * 1.25, base * 1.2, 0.06, 0.02, 0.22, t);
        this.tone(o, 'sine', base, base * 0.97, 0.06, 0.02, 0.32, t + 0.3);
      }
    }
    this.frogTimer -= dt;
    if (this.frogTimer <= 0) {
      this.frogTimer = rand(0.8, 3.5);
      const o = this.out(around(6, 25, 0, 0.5), 0.1, this.amb);
      const t = this.now();
      const f = rand(260, 480);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.tone(o, 'square', f, f * 0.85, 0.018, 0.004, 0.06, t + i * 0.09);
        this.burst(o, this.pink, 'bandpass', f * 2, 6, 0.03, 0.003, 0.05, t + i * 0.09);
      }
    }
    this.leafDripTimer -= dt;
    while (this.leafDripTimer <= 0) {
      this.leafDripTimer += rand(0.15, 0.6);
      const o = this.out(around(1, 9, 0, 3), 0.05, this.amb);
      this.tone(o, 'sine', rand(1200, 2600), rand(500, 900), rand(0.01, 0.03), 0.001, rand(0.02, 0.05));
    }
    this.monkeyTimer -= dt;
    if (this.monkeyTimer <= 0) {
      this.monkeyTimer = rand(28, 60);
      // A far-off howler: a gravelly, rising and falling roar, several times.
      const o = this.out(around(45, 80, 10, 20), 0.6, this.amb);
      const t = this.now();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t0 = t + i * rand(0.7, 1.0);
        this.tone(o, 'sawtooth', 110, 180, 0.05, 0.25, 0.6, t0);
        this.burst(o, this.brown, 'bandpass', 380, 2, 0.12, 0.2, 0.6, t0, 520);
      }
    }
  }

  /**
   * Desert: storm 0..1 drives the wind level and the sand hiss; indoors 0..1 muffles it and brings
   * back a small-room reverb.
   */
  setWind(storm: number, indoors: number) {
    if (!this.started || !this.wind) return;
    const t = this.now();
    const w = this.wind;
    w.gain.gain.setTargetAtTime((0.22 + storm * 0.75) * (1 - indoors * 0.55), t, 0.4);
    w.hiss.gain.setTargetAtTime(storm * storm * 0.22, t, 0.4);
    w.filter.frequency.setTargetAtTime(indoors > 0.5 ? 650 : 20000, t, 0.35);
    this.reverbSend.gain.setTargetAtTime(indoors > 0.5 ? 0.9 : 0.3, t, 0.3);
  }

  /** Underground the rain becomes a distant muffled hiss through the stairwells. */
  setUnderground(k: number) {
    if (!this.started || k === this.under || !this.rainFilter || !this.rainGain) return;
    this.under = k;
    const t = this.now();
    this.rainFilter.frequency.setTargetAtTime(k ? 380 : 20000, t, 0.6);
    this.rainGain.gain.setTargetAtTime(k ? 0.35 : 1, t, 0.6);
  }

  /** Electric buzz of a neon sign, positioned in the world. Gain is driven by the sign's flicker. */
  addHum(pos: V3, freq = 100) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = freq * 2 + 0.7;
    const bp = this.filter('bandpass', freq * 3, 1.2);
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.rolloffFactor = 1.6;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.3;
    o1.connect(bp);
    o2.connect(o2g).connect(bp);
    bp.connect(g).connect(p).connect(this.levelBus);
    this.levelSrc(o1).start();
    this.levelSrc(o2).start();
    const h = { gain: g, base: 0.035 };
    this.hums.push(h);
    return h;
  }

  setHum(h: { gain: GainNode; base: number }, v: number) {
    if (!this.started) return;
    h.gain.gain.setTargetAtTime(h.base * v, this.now(), 0.01);
  }

  updateListener(cam: THREE.Camera) {
    if (!this.started) return;
    const l = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const t = this.now();
    if (l.positionX) {
      l.positionX.setValueAtTime(e[12], t);
      l.positionY.setValueAtTime(e[13], t);
      l.positionZ.setValueAtTime(e[14], t);
      l.forwardX.setValueAtTime(-e[8], t);
      l.forwardY.setValueAtTime(-e[9], t);
      l.forwardZ.setValueAtTime(-e[10], t);
      l.upX.setValueAtTime(e[4], t);
      l.upY.setValueAtTime(e[5], t);
      l.upZ.setValueAtTime(e[6], t);
    } else {
      l.setPosition(e[12], e[13], e[14]);
      l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  /** Random environmental events: drips on metal, distant traffic, sirens. */
  update(dt: number, listenerPos: V3) {
    if (!this.started) return;
    if (this.ambience === 'desert') return this.updateDesert(dt, listenerPos);
    if (this.ambience === 'jungle') return this.updateJungle(dt, listenerPos);
    if (this.ambience === 'harbour') return this.updateHarbour(dt, listenerPos);
    if (this.ambience === 'terminal') return this.updateTerminal(dt, listenerPos);
    if (this.ambience !== 'city') return;
    this.dripTimer -= dt;
    while (this.dripTimer <= 0) {
      this.dripTimer += rand(0.03, 0.12);
      const p = { x: listenerPos.x + rand(-8, 8), y: rand(0, 5), z: listenerPos.z + rand(-8, 8) };
      const o = this.out(p, 0.05, this.amb);
      if (Math.random() < 0.15) this.metal(o, rand(1400, 2600), 0.025, 0.08, [1, 2.7]);
      else this.tone(o, 'sine', rand(2200, 5000), rand(900, 1500), rand(0.01, 0.035), 0.001, rand(0.015, 0.04));
    }
    this.carTimer -= dt;
    if (this.carTimer <= 0) {
      this.carTimer = rand(7, 16);
      this.distantCar();
    }
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = rand(35, 70);
      this.siren();
    }
    this.hornTimer -= dt;
    if (this.hornTimer <= 0) {
      this.hornTimer = rand(14, 32);
      this.carHorn();
    }
  }

  /** Desert events: a sheet of tin creaking somewhere, a loose tarp snapping in a gust. */
  private updateDesert(dt: number, l: V3) {
    this.creakTimer -= dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = rand(8, 20);
      const a = rand(0, Math.PI * 2);
      const d = rand(12, 35);
      const o = this.out({ x: l.x + Math.cos(a) * d, y: rand(1, 4), z: l.z + Math.sin(a) * d }, 0.2, this.amb);
      const t = this.now();
      this.tone(o, 'sawtooth', rand(140, 220), rand(90, 130), 0.025, 0.08, rand(0.5, 1.1), t);
      this.metal(o, rand(300, 520), 0.03, 0.6, [1, 2.76, 5.4], t + rand(0.2, 0.6));
    }
    this.flapTimer -= dt;
    if (this.flapTimer <= 0) {
      this.flapTimer = rand(4, 11);
      const a = rand(0, Math.PI * 2);
      const d = rand(6, 22);
      const o = this.out({ x: l.x + Math.cos(a) * d, y: rand(1.5, 3), z: l.z + Math.sin(a) * d }, 0.1, this.amb);
      const t = this.now();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.burst(o, this.pink, 'bandpass', rand(600, 1100), 1.2, 0.06, 0.003, 0.05, t + i * rand(0.07, 0.12));
    }
  }

  private distantCar() {
    const t = this.now();
    const dur = rand(3, 5);
    const src = this.noise(this.brown);
    const f = this.filter('lowpass', 250);
    f.frequency.setValueAtTime(250, t);
    f.frequency.linearRampToValueAtTime(700, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(250, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const pan = this.ctx.createStereoPanner();
    const s = Math.random() < 0.5 ? -1 : 1;
    pan.pan.setValueAtTime(-s * 0.8, t);
    pan.pan.linearRampToValueAtTime(s * 0.8, t + dur);
    src.connect(f).connect(g).connect(pan).connect(this.amb);
    src.stop(t + dur + 0.1);
  }

  siren() {
    if (!this.started) return;
    const t = this.now();
    const dur = rand(8, 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = this.filter('lowpass', 1500);
    const pan = this.ctx.createStereoPanner();
    pan.pan.setValueAtTime(rand(-1, 1), t);
    pan.pan.linearRampToValueAtTime(rand(-1, 1), t + dur);
    const send = this.ctx.createGain();
    send.gain.value = 1.2;
    for (const det of [0, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      // Wail: slow up/down sweeps.
      for (let k = 0; k < dur; k += 2.4) {
        o.frequency.setValueAtTime(620 + det, t + k);
        o.frequency.linearRampToValueAtTime(1250 + det, t + k + 1.2);
        o.frequency.linearRampToValueAtTime(620 + det, t + k + 2.4);
      }
      o.connect(lp);
      o.start(t);
      o.stop(t + dur);
    }
    lp.connect(g).connect(pan).connect(this.amb);
    pan.connect(send).connect(this.reverbSend);
  }

  thunder() {
    if (!this.started) return;
    const t = this.now();
    const src = this.noise(this.brown);
    const f = this.filter('lowpass', 220);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.25, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 5);
    src.connect(f).connect(g).connect(this.amb);
    src.stop(t + 5.2);
    this.burst(this.amb, this.white, 'lowpass', 900, 0.5, 0.2, 0.01, 0.6, t);
  }

  trainPass(dir: number) {
    if (!this.started) return;
    const t = this.now();
    const dur = 16;
    const src = this.noise(this.brown, true);
    const f = this.filter('lowpass', 300);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 5);
    g.gain.linearRampToValueAtTime(0.45, t + 8);
    g.gain.linearRampToValueAtTime(0.18, t + 11);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const pan = this.ctx.createStereoPanner();
    pan.pan.setValueAtTime(-dir * 0.9, t);
    pan.pan.linearRampToValueAtTime(dir * 0.9, t + dur);
    src.connect(f).connect(g).connect(pan).connect(this.amb);
    src.stop(t + dur);
    // Rail joints: ta-dum, ta-dum.
    for (let k = 3; k < 13; k += 0.42) {
      const near = 1 - Math.abs(k - 8) / 5;
      this.burst(pan, this.white, 'lowpass', 500, 0.7, 0.12 * near, 0.003, 0.08, t + k);
      this.burst(pan, this.white, 'lowpass', 500, 0.7, 0.1 * near, 0.003, 0.08, t + k + 0.11);
    }
    // Wheel squeal.
    this.tone(pan, 'sine', 3100, 3300, 0.008, 2, 4, t + 6);
  }

  // ------------------------------------------------------------------ weapon
  /**
   * The player's shot. 21.0: every gun has its own report, scaled to its weight: the shotgun a cannon
   * (the loudest, the lowest, the longest), the SMG a buzzsaw (quiet, short, high, a little pitch
   * wander so a stream of them buzzes), the pistol a sharp crack, the rifle between. `energy`: the
   * SMG's energy variant (blaster and corporate maps), a short zap instead of the crack.
   */
  gunshot(kind: GunSound = 'plasma', energy = false) {
    if (!this.started) return;
    // The jungle falls silent around a gunshot, then the insects come back over a few seconds.
    if (this.insects) {
      const t = this.now();
      this.insects.gain.cancelScheduledValues(t);
      this.insects.gain.setTargetAtTime(0.05, t, 0.05);
      this.insects.gain.setTargetAtTime(0.35, t + 1.2, 2.2);
    }
    if (kind === 'rifle') return this.rifleShot();
    if (kind === 'shotgun') return this.shotgunShot();
    if (kind === 'smg') return this.smgShot(energy);
    if (kind === 'pistol') return this.pistolShot();
    const t = this.now();
    const o = this.out(null, 0.9);
    const p = rand(0.95, 1.05);
    this.burst(o, this.white, 'highpass', 1800, 0.7, 0.9, 0.001, 0.05, t);
    this.burst(o, this.white, 'lowpass', 6000 * p, 0.8, 1.0, 0.002, 0.22, t, 400);
    this.tone(o, 'sine', 160 * p, 40, 1.1, 0.002, 0.2, t);
    this.tone(o, 'sawtooth', 1500 * p, 160, 0.12, 0.001, 0.09, t);
    this.tone(o, 'square', 3200, 3000, 0.05, 0.001, 0.012, t + 0.035);
    // Futuristic tail: a quick filtered zap.
    const z = this.filter('bandpass', 2400, 4);
    z.connect(o);
    this.tone(z, 'sawtooth', 2600, 700, 0.3, 0.001, 0.07, t);
  }

  /**
   * Assault rifle: a hard supersonic crack, a short low punch, the bolt's metallic clack and a dry
   * slap off the nearest walls. Kinetic, no electronics; slight variation so bursts don't machine-gun
   * the same sample.
   */
  private rifleShot() {
    const t = this.now();
    const o = this.out(null, 0.55);
    const p = rand(0.94, 1.06);
    this.burst(o, this.white, 'highpass', 2600 * p, 0.6, 1.1, 0.0005, 0.03, t);
    this.burst(o, this.white, 'bandpass', 1100 * p, 0.9, 0.9, 0.001, 0.09, t, 300);
    this.burst(o, this.brown, 'lowpass', 900, 0.7, 1.2, 0.002, 0.16, t, 120);
    this.tone(o, 'sine', 110 * p, 42, 1.2, 0.002, 0.12, t);
    // Bolt carrier slamming home.
    this.metal(o, rand(1700, 2000), 0.09, 0.05, [1, 1.9, 3.1], t + 0.028);
    this.burst(o, this.white, 'bandpass', 4200, 2, 0.12, 0.001, 0.02, t + 0.03);
    // Dry slap back from the surroundings.
    this.burst(o, this.pink, 'bandpass', 700, 0.8, 0.22, 0.004, 0.12, t + 0.09 + rand(0, 0.03), 300);
  }

  /** 21.0, the SMG: a buzzsaw. Each round small and short (no low punch, a tight high crack), quieter than the rifle. */
  private smgShot(energy: boolean) {
    const t = this.now();
    const o = this.out(null, 0.38);
    const p = rand(0.9, 1.12);
    if (energy) {
      this.tone(o, 'sawtooth', 2100 * p, 520, 0.22, 0.001, 0.05, t);
      this.tone(o, 'square', 340 * p, 120, 0.18, 0.001, 0.045, t);
      this.burst(o, this.white, 'bandpass', 3200 * p, 1.2, 0.35, 0.0005, 0.03, t);
      return;
    }
    this.burst(o, this.white, 'highpass', 3200 * p, 0.7, 0.9, 0.0005, 0.02, t);
    this.burst(o, this.white, 'bandpass', 1700 * p, 1.1, 0.7, 0.001, 0.045, t, 500);
    this.tone(o, 'sine', 190 * p, 70, 0.5, 0.001, 0.04, t);
    this.metal(o, rand(2600, 3000), 0.05, 0.025, [1, 2.2], t + 0.018);
  }

  /** 21.0, the pistol (kinetic): a sharp, bright crack and a short snap of the slide. */
  private pistolShot() {
    const t = this.now();
    const o = this.out(null, 0.6);
    const p = rand(0.95, 1.05);
    this.burst(o, this.white, 'highpass', 2400 * p, 0.6, 1.0, 0.0005, 0.03, t);
    this.burst(o, this.white, 'bandpass', 1400 * p, 0.9, 0.8, 0.001, 0.07, t, 400);
    this.tone(o, 'sine', 140 * p, 50, 0.9, 0.002, 0.09, t);
    this.metal(o, rand(2100, 2400), 0.07, 0.03, [1, 2.4], t + 0.03);
    this.burst(o, this.pink, 'bandpass', 800, 0.8, 0.15, 0.004, 0.1, t + 0.08, 300);
  }

  /**
   * Shotgun: a deep, wide boom (a heavy low thump and a broad noise blast), a ragged crack on top and
   * a long rolling tail. Slower and bigger than the rifle in every part.
   */
  private shotgunShot() {
    const t = this.now();
    const o = this.out(null, 1.0);
    const p = rand(0.95, 1.05);
    // 21.0, the cannon: a sub-bass drop under the boom.
    this.tone(o, 'sine', 60 * p, 24, 1.4, 0.004, 0.45, t);
    this.tone(o, 'sine', 85 * p, 32, 1.6, 0.003, 0.32, t);
    this.burst(o, this.brown, 'lowpass', 1400, 0.6, 1.4, 0.002, 0.35, t, 160);
    this.burst(o, this.white, 'lowpass', 5200 * p, 0.7, 0.9, 0.001, 0.12, t, 600);
    this.burst(o, this.white, 'highpass', 2200, 0.6, 0.7, 0.0005, 0.04, t);
    // The roll of it through the trees.
    this.burst(o, this.pink, 'lowpass', 500, 0.6, 0.35, 0.03, 0.9, t + 0.05, 140);
  }

  /** Pump action: the fore-end racked back (cha) and slammed forward (chunk), as the reload's last stage. */
  pump() {
    if (!this.started) return;
    this.play(pumpLayers(), this.out(null, 0.15, this.ui));
  }

  /** Holster: cloth rustle and a soft clip; draw: a quick metallic slide. */
  holster(away: boolean) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.08);
    if (away) {
      this.burst(o, this.pink, 'bandpass', 1400, 0.8, 0.16, 0.02, 0.18, t, 700);
      this.tone(o, 'square', 1800, 1700, 0.04, 0.001, 0.012, t + 0.16);
    } else {
      this.burst(o, this.white, 'bandpass', 2600, 1.4, 0.14, 0.005, 0.1, t, 5200);
      this.tone(o, 'square', 2600, 2500, 0.05, 0.001, 0.012, t + 0.09);
      this.metal(o, 3200, 0.025, 0.08, [1, 2.3], t + 0.1);
    }
  }

  dryFire() {
    if (!this.started) return;
    const o = this.out(null, 0.05);
    this.tone(o, 'square', 2600, 2400, 0.08, 0.001, 0.015);
    this.burst(o, this.white, 'bandpass', 3000, 2, 0.1, 0.001, 0.02);
  }

  /** 26.0: a stage of a reload, synthesised for the gun in hand (ReloadSynth's recipes). */
  reload(stage: ReloadStage, kind: ReloadKind = 'rifle') {
    if (!this.started) return;
    const r = reloadRecipe(kind, stage);
    if (r.length) this.play(r, this.out(null, 0.1));
  }

  /** Builds a recipe's nodes and schedules them all on the audio clock: nothing runs after this call. */
  private play(r: readonly Layer[], o: AudioNode) {
    const t = this.now();
    // Each play a touch higher or lower: five shells in a row are never the same click.
    const p = rand(0.97, 1.03);
    for (const l of r) {
      if (l.v === 'tone') this.tone(o, l.wave, l.f0 * p, l.f1 * p, l.peak, l.attack, l.decay, t + l.at);
      else if (l.v === 'noise') this.burst(o, this[l.color], l.filter, l.f * p, l.q, l.peak, l.attack, l.decay, t + l.at, l.fEnd && l.fEnd * p);
      else this.metal(o, l.base * p, l.peak, l.decay, l.ratios, t + l.at);
    }
  }

  shellBounce(pos: V3, strength: number) {
    if (!this.started) return;
    const o = this.out(pos, 0.05);
    this.metal(o, rand(3800, 5200), 0.04 * strength, 0.07, [1, 1.6, 2.9]);
  }

  hitSurface(pos: V3, surface: string) {
    if (!this.started) return;
    const o = this.out(pos, 0.35);
    if (surface === 'metal') {
      this.metal(o, rand(900, 1500), 0.18, 0.35);
      this.burst(o, this.white, 'highpass', 3000, 0.7, 0.25, 0.001, 0.04);
    } else if (surface === 'wood') {
      this.burst(o, this.white, 'bandpass', 700, 1.5, 0.35, 0.001, 0.08);
      this.tone(o, 'sine', 300, 120, 0.2, 0.001, 0.08);
    } else if (surface === 'sand') {
      // A soft thud and a hiss of thrown grains.
      this.burst(o, this.brown, 'lowpass', 500, 0.7, 0.4, 0.002, 0.09);
      this.burst(o, this.white, 'bandpass', 3200, 0.8, 0.08, 0.004, 0.2);
    } else {
      this.burst(o, this.white, 'bandpass', 1800, 0.9, 0.3, 0.001, 0.07);
      this.burst(o, this.white, 'highpass', 4000, 0.7, 0.12, 0.001, 0.12); // spray of water and grit
    }
  }

  hitEnemy(pos: V3, armor: boolean) {
    if (!this.started) return;
    const o = this.out(pos, 0.25);
    this.tone(o, 'sine', 140, 55, 0.5, 0.002, 0.12);
    this.burst(o, this.white, 'lowpass', 2500, 0.8, 0.35, 0.001, 0.09);
    if (armor) this.metal(o, rand(700, 1000), 0.15, 0.25);
    // Electric sizzle from cyber parts.
    const f = this.filter('highpass', 3000);
    f.connect(o);
    this.tone(f, 'sawtooth', rand(60, 90), rand(40, 60), 0.15, 0.001, 0.15);
  }

  hitmarker(kill = false) {
    if (!this.started) return;
    const o = this.out(null, 0, this.ui);
    this.tone(o, 'sine', kill ? 1500 : 2300, kill ? 1500 : 2300, 0.07, 0.001, 0.035);
    if (kill) this.tone(o, 'sine', 2250, 2250, 0.06, 0.001, 0.12, this.now() + 0.06);
  }

  enemyDeath(pos: V3, voice: 'synth' | 'human' = 'synth') {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.5);
    if (voice === 'human') {
      // A cut-off grunt and the body hitting the sand.
      this.voice(o, t, 1, rand(110, 150), 5, 0.12, true);
      this.burst(o, this.brown, 'lowpass', 400, 0.7, 0.5, 0.004, 0.25, t + 0.35);
      return;
    }
    this.tone(o, 'sine', 90, 35, 0.6, 0.005, 0.5, t);
    this.burst(o, this.white, 'lowpass', 3000, 0.7, 0.4, 0.003, 0.35, t, 200);
    // Digital glitch descending in steps.
    const g = this.ctx.createOscillator();
    g.type = 'square';
    for (let i = 0; i < 8; i++) g.frequency.setValueAtTime(rand(200, 1600) * (1 - i / 10), t + i * 0.04);
    const gg = this.gainEnv(0.06, 0.002, 0.34, t);
    g.connect(gg).connect(o);
    g.start(t);
    g.stop(t + 0.4);
  }

  playerHurt() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.1);
    this.tone(o, 'sine', 110, 45, 0.7, 0.002, 0.25, t);
    this.burst(o, this.white, 'lowpass', 600, 0.7, 0.4, 0.002, 0.18, t);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(600, t);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, t + 0.7);
  }

  footstep(intensity: number) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.08);
    this.burst(o, this.white, 'bandpass', rand(900, 1500), 1.0, 0.12 * intensity, 0.003, 0.07, t);
    this.burst(o, this.pink, 'lowpass', rand(500, 900), 0.6, 0.18 * intensity, 0.01, 0.16, t + 0.01); // wet slap
    this.tone(o, 'sine', 90, 50, 0.12 * intensity, 0.002, 0.06, t);
  }

  /** 12.0: a slide: grit under the boots, a low scrape that dies away with the speed. */
  slide(intensity: number) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.12);
    this.burst(o, this.pink, 'lowpass', 1400, 0.7, 0.32 * intensity, 0.02, 0.95, t, 300);
    this.burst(o, this.white, 'bandpass', 2600, 1.2, 0.07 * intensity, 0.01, 0.6, t, 900);
  }

  land() {
    if (!this.started) return;
    const o = this.out(null, 0.1);
    this.tone(o, 'sine', 100, 40, 0.4, 0.002, 0.15);
    this.burst(o, this.pink, 'lowpass', 900, 0.6, 0.35, 0.005, 0.25);
  }

  // ------------------------------------------------------------------ enemies & world
  clang(pos: V3, loud = 1) {
    if (!this.started) return;
    const o = this.out(pos, 1.2);
    this.metal(o, 210, 0.5 * loud, 1.8, [1, 1.47, 2.09, 2.56, 3.9]);
    this.burst(o, this.white, 'bandpass', 2000, 0.8, 0.4 * loud, 0.001, 0.08);
  }

  /** A bot's shot. 13.0: `gun` (an armory weapon) decides the report; without it, the look's voice does. */
  enemyShot(pos: V3, voice: 'synth' | 'human' = 'synth', gun?: GunSound, energy = false) {
    if (!this.started) return;
    const o = this.out(pos, gun === 'shotgun' ? 1.0 : gun === 'smg' ? 0.4 : 0.7);
    if (gun === 'smg') {
      // 21.0: an SMG at range, a quick high rattle.
      const t = this.now();
      if (energy) this.tone(o, 'sawtooth', rand(1700, 2200), 500, 0.12, 0.001, 0.05, t);
      else this.burst(o, this.white, 'highpass', rand(2600, 3200), 0.7, 0.4, 0.0005, 0.025, t);
      this.burst(o, this.white, 'bandpass', rand(1300, 1700), 1, 0.3, 0.001, 0.04, t);
      return;
    }
    if (gun === 'pistol') {
      const t = this.now();
      this.burst(o, this.white, 'highpass', 2000, 0.6, 0.45, 0.0005, 0.03, t);
      this.burst(o, this.pink, 'bandpass', 1100, 0.8, 0.3, 0.002, 0.08, t);
      return;
    }
    if (gun === 'shotgun') {
      // A twelve-gauge at range: a heavy boom, a wide crack and a long rolling tail.
      const t = this.now();
      this.burst(o, this.white, 'highpass', 1600, 0.5, 0.5, 0.0005, 0.04, t);
      this.burst(o, this.brown, 'lowpass', 420, 0.7, 0.9, 0.002, 0.26, t, 80);
      this.burst(o, this.pink, 'bandpass', 380, 0.7, 0.2, 0.01, 0.35, t + 0.1);
      return;
    }
    if (gun === 'rifle' || (!gun && voice === 'human')) {
      // A rifle at range: crack, thump and a dry tail.
      const t = this.now();
      this.burst(o, this.white, 'highpass', 2200, 0.6, 0.45, 0.0005, 0.03, t);
      this.burst(o, this.brown, 'lowpass', 700, 0.7, 0.6, 0.002, 0.14, t, 120);
      this.burst(o, this.pink, 'bandpass', 600, 0.8, 0.15, 0.005, 0.18, t + 0.08);
      return;
    }
    this.tone(o, 'square', 900, 140, 0.25, 0.002, 0.18);
    this.tone(o, 'sawtooth', 2400, 600, 0.12, 0.001, 0.1);
    this.burst(o, this.white, 'bandpass', 1500, 1, 0.3, 0.001, 0.12);
  }

  gunnerCharge(pos: V3, voice: 'synth' | 'human' = 'synth') {
    if (!this.started) return;
    const o = this.out(pos, 0.2);
    if (voice === 'human') {
      // Shouldering the rifle: sling rattle and the safety snapping off.
      const t = this.now();
      this.burst(o, this.pink, 'bandpass', 2400, 1.5, 0.08, 0.005, 0.12, t);
      this.metal(o, 2600, 0.06, 0.04, [1, 2.3], t + 0.18);
      return;
    }
    this.tone(o, 'sine', 300, 1400, 0.12, 0.6, 0.1);
    this.tone(o, 'triangle', 600, 2800, 0.04, 0.6, 0.1);
  }

  plasmaImpact(pos: V3) {
    if (!this.started) return;
    const o = this.out(pos, 0.4);
    this.burst(o, this.white, 'bandpass', 1200, 1, 0.4, 0.001, 0.15, this.now(), 300);
    this.tone(o, 'sine', 500, 80, 0.2, 0.001, 0.15);
  }

  plasmaWhiz(pos: V3, voice: 'synth' | 'human' = 'synth') {
    if (!this.started) return;
    const o = this.out(pos, 0.1);
    if (voice === 'human') {
      // A round snapping past: a sharp supersonic crack.
      this.burst(o, this.white, 'highpass', 3500, 0.8, 0.22, 0.0005, 0.025);
      return;
    }
    this.tone(o, 'sawtooth', 1200, 500, 0.08, 0.02, 0.2);
  }

  runnerScreech(pos: V3, voice: 'synth' | 'human' = 'synth') {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.6);
    if (voice === 'human') {
      // A raider's war cry: a shouted phrase, rough and loud.
      this.voice(o, t, 3, rand(170, 230), 6, 0.24, true);
      this.burst(o, this.white, 'bandpass', 1800, 1.2, 0.05, 0.02, 0.5, t);
      return;
    }
    const bp = this.filter('bandpass', 1400, 4);
    bp.connect(o);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.linearRampToValueAtTime(520, t + 0.15);
    osc.frequency.linearRampToValueAtTime(300, t + 0.5);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 32;
    const vg = this.ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(osc.frequency);
    const g = this.gainEnv(0.25, 0.03, 0.5, t);
    osc.connect(g).connect(bp);
    osc.start(t);
    osc.stop(t + 0.6);
    vib.start(t);
    vib.stop(t + 0.6);
    this.burst(o, this.white, 'bandpass', 2600, 2, 0.12, 0.02, 0.4, t);
  }

  swipe(pos: V3) {
    if (!this.started) return;
    const o = this.out(pos, 0.2);
    this.burst(o, this.white, 'bandpass', 3500, 1.5, 0.35, 0.02, 0.14, this.now(), 600);
  }

  enemyStep(pos: V3, heavy: boolean) {
    if (!this.started) return;
    const o = this.out(pos, 0.05);
    this.burst(o, this.pink, 'lowpass', heavy ? 500 : 900, 0.6, heavy ? 0.25 : 0.12, 0.004, 0.1);
    if (heavy) this.metal(o, 300, 0.03, 0.08, [1, 2.2]);
  }

  /** Shot electrical cabinet building up. */
  electricCharge(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.3);
    const bp = this.filter('bandpass', 900, 3);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
    bp.connect(o);
    this.tone(bp, 'sawtooth', 60, 240, 0.4, 0.35, 0.08, t);
    this.burst(o, this.white, 'highpass', 4000, 0.7, 0.12, 0.3, 0.1, t);
  }

  /** The cabinet discharging: a heavy zap and crackle. */
  discharge(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 1.0);
    this.burst(o, this.white, 'lowpass', 8000, 0.7, 0.9, 0.001, 0.4, t, 400);
    this.tone(o, 'sawtooth', 120, 40, 0.6, 0.001, 0.5, t);
    this.tone(o, 'square', 2400, 300, 0.15, 0.001, 0.25, t);
    for (let i = 0; i < 10; i++) this.burst(o, this.white, 'highpass', 2500, 0.7, rand(0.1, 0.3), 0.001, 0.02, t + 0.05 + i * rand(0.02, 0.06));
  }

  glassBreak(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.4);
    this.burst(o, this.white, 'highpass', 3000, 0.7, 0.5, 0.001, 0.12, t);
    for (let i = 0; i < 9; i++) this.metal(o, rand(3500, 7500), 0.05, rand(0.05, 0.15), [1, 1.5], t + 0.03 + i * rand(0.02, 0.07));
    this.burst(o, this.white, 'highpass', 5000, 0.7, 0.15, 0.001, 0.03, t + 0.08);
  }

  pickup() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.4, this.ui);
    [659.25, 987.77, 1318.5].forEach((f, i) => this.tone(o, 'triangle', f, f, 0.09, 0.005, 0.35, t + i * 0.07));
    this.burst(o, this.white, 'bandpass', 2000, 1, 0.08, 0.05, 0.25, t, 6000);
  }

  /** Railway crossing bell (fumikiri): one strike, called on a fixed beat while the signals blink. */
  crossingBell(pos: V3) {
    if (!this.started) return;
    const o = this.out(pos, 0.6, this.amb);
    this.metal(o, 745, 0.09, 0.4, [1, 2.01, 2.76, 4.05]);
  }

  /** Distant station melody before a train arrives. */
  stationChime() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out({ x: -30, y: 12, z: -60 }, 1.4, this.amb);
    const lp = this.filter('lowpass', 2400);
    lp.connect(o);
    const notes = [659.25, 830.61, 987.77, 1318.5, 987.77, 1108.7, 1318.5];
    notes.forEach((f, i) => {
      this.tone(lp, 'triangle', f, f, 0.18, 0.01, 0.5, t + i * 0.22);
      this.tone(lp, 'sine', f * 2, f * 2, 0.05, 0.01, 0.3, t + i * 0.22);
    });
  }

  steamHiss(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.2, this.amb);
    const src = this.noise(this.white);
    const f = this.filter('highpass', 2500);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    src.connect(f).connect(g).connect(o);
    src.stop(t + 2.3);
  }

  /** Far-off car horn somewhere in the city. */
  carHorn() {
    if (!this.started) return;
    const t = this.now();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);
    const lp = this.filter('lowpass', 900);
    lp.connect(pan).connect(this.amb);
    const s = this.ctx.createGain();
    s.gain.value = 1.0;
    pan.connect(s).connect(this.reverbSend);
    const dur = rand(0.3, 0.8);
    for (const f of [rand(330, 360), rand(415, 440)]) this.tone(lp, 'square', f, f, 0.025, 0.02, dur, t);
    if (Math.random() < 0.4) for (const f of [345, 430]) this.tone(lp, 'square', f, f, 0.02, 0.02, 0.25, t + dur + 0.15);
  }

  /** Continuous positional loops: the fountain and a pachinko parlour door. */
  addLoop(pos: V3, kind: 'fountain' | 'pachinko') {
    if (!this.started) return;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = kind === 'fountain' ? 3 : 2;
    p.rolloffFactor = 1.4;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.levelBus);
    if (kind === 'fountain') {
      const a = this.levelSrc(this.noise(this.white, true));
      const bp = this.filter('bandpass', 1800, 0.6);
      const g = ctx.createGain();
      g.gain.value = 0.09;
      a.connect(bp).connect(g).connect(p);
      const b = this.levelSrc(this.noise(this.pink, true));
      const lp = this.filter('lowpass', 500);
      const g2 = ctx.createGain();
      g2.gain.value = 0.12;
      b.connect(lp).connect(g2).connect(p);
      const lfo = this.levelSrc(ctx.createOscillator());
      lfo.frequency.value = 0.31;
      const lg = ctx.createGain();
      lg.gain.value = 0.03;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
    } else {
      const a = this.levelSrc(this.noise(this.pink, true));
      const bp = this.filter('bandpass', 2600, 1.2);
      const g = ctx.createGain();
      g.gain.value = 0.05;
      a.connect(bp).connect(g).connect(p);
      // A cheesy jingle loop under the ball noise.
      const o = this.levelSrc(ctx.createOscillator());
      o.type = 'square';
      const og = ctx.createGain();
      og.gain.value = 0.006;
      const t = this.now();
      const mel = [784, 988, 1175, 988, 1319, 1175, 988, 784];
      for (let i = 0; i < 400; i++) o.frequency.setValueAtTime(mel[i % mel.length], t + i * 0.18);
      o.connect(og).connect(p);
      o.start(t);
      o.stop(t + 400 * 0.18);
    }
  }

  /**
   * Speech-like babble: a buzzy glottal source through two moving formant filters, chopped into
   * syllables. Not words, just the cadence of a voice (barks, radio chatter, announcements).
   */
  private voice(dest: AudioNode, t: number, syllables: number, pitch: number, rate = 7, peak = 0.12, shout = false) {
    const src = this.ctx.createOscillator();
    src.type = 'sawtooth';
    const dur = syllables / rate + 0.1;
    src.frequency.setValueAtTime(pitch, t);
    for (let i = 0; i < syllables; i++) src.frequency.setValueAtTime(pitch * (shout ? 1.25 : 1) * rand(0.88, 1.15), t + i / rate);
    src.frequency.linearRampToValueAtTime(pitch * (shout ? 1.1 : 0.85), t + dur);
    const f1 = this.filter('bandpass', 600, 6);
    const f2 = this.filter('bandpass', 1500, 8);
    const vowels: [number, number][] = [[750, 1150], [500, 1800], [350, 2200], [600, 1000], [450, 900]];
    for (let i = 0; i < syllables; i++) {
      const [a, b] = vowels[Math.floor(Math.random() * vowels.length)];
      f1.frequency.setTargetAtTime(a, t + i / rate, 0.02);
      f2.frequency.setTargetAtTime(b, t + i / rate, 0.02);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < syllables; i++) {
      const s = t + i / rate;
      g.gain.linearRampToValueAtTime(peak * rand(0.6, 1), s + 0.025);
      g.gain.linearRampToValueAtTime(peak * 0.15, s + 0.8 / rate);
    }
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f1).connect(g);
    src.connect(f2).connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
    return dur;
  }

  /** A frightened civilian. */
  scream(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.4);
    const g = this.ctx.createGain();
    g.gain.value = 1.4;
    g.connect(o);
    this.voice(g, t, 2, rand(260, 340), 3, 0.2, true);
  }

  /** Snippet of someone talking nearby (crowd life). */
  chatter(pos: V3) {
    if (!this.started) return;
    const o = this.out(pos, 0.15, this.amb);
    this.voice(o, this.now(), 3 + Math.floor(Math.random() * 6), rand(105, 230), rand(6, 8), 0.05);
  }

  /** Station PA: two-tone chime and an announcement-like voice cadence through a hall reverb. */
  announce(seconds = 2.6) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out({ x: 0, y: -3, z: 25 }, 1.2, this.amb);
    const g = this.ctx.createGain();
    g.gain.value = 1.6;
    g.connect(o);
    for (const [f, d] of [[830.6, 0], [659.3, 0.34]] as const) {
      this.tone(g, 'sine', f, f, 0.12, 0.005, 0.9, t + d);
      this.tone(g, 'sine', f * 2, f * 2, 0.025, 0.005, 0.5, t + d);
    }
    const band = this.filter('bandpass', 1300, 0.7);
    band.connect(g);
    this.voice(band, t + 0.9, Math.round(seconds * 7), 150, 7, 0.1);
  }

  /** Door open/close chime of the train. */
  doorChime(pos: V3, open: boolean) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.4, this.amb);
    const notes = open ? [987.8, 783.99] : [783.99, 987.8, 783.99];
    notes.forEach((f, i) => this.tone(o, 'triangle', f, f, 0.08, 0.005, 0.35, t + i * 0.22));
    // Pneumatic hiss of the doors.
    this.burst(o, this.white, 'highpass', 3000, 0.7, 0.12, 0.05, 0.6, t + 0.1);
  }

  /** An original, short departure melody (hassha merodii) on a bell-like synth. */
  departureMelody() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out({ x: 0, y: -3, z: 30 }, 1.0, this.amb);
    const g = this.ctx.createGain();
    g.gain.value = 1.4;
    g.connect(o);
    const mel = [76, 79, 83, 81, 79, 76, 74, 76, 79, 81, 83, 88];
    mel.forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      const at = t + i * 0.24;
      this.tone(g, 'sine', f, f, 0.08, 0.004, 0.45, at);
      this.tone(g, 'sine', f * 3.01, f * 3.01, 0.015, 0.002, 0.18, at);
    });
  }

  /** Doors-closing warning: three beeps and a short phrase. */
  doorWarning(pos: V3) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.3, this.amb);
    for (let i = 0; i < 3; i++) this.tone(o, 'square', 1450, 1450, 0.03, 0.002, 0.18, t + i * 0.36);
    const band = this.filter('bandpass', 1400, 0.8);
    band.connect(o);
    this.voice(band, t + 1.2, 6, 165, 7, 0.08);
  }

  /** Continuous train noise: set every frame from speed and how much of it reaches the listener. */
  metroRumble(level: number, speed: number) {
    if (!this.started) return;
    if (!this.rumble) {
      const src = this.levelSrc(this.noise(this.brown, true));
      const lp = this.filter('lowpass', 300);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g).connect(this.levelBus);
      const whine = this.levelSrc(this.ctx.createOscillator());
      whine.type = 'sawtooth';
      const wg = this.ctx.createGain();
      wg.gain.value = 0;
      const wf = this.filter('bandpass', 900, 6);
      whine.connect(wf).connect(wg).connect(this.levelBus);
      whine.start();
      this.rumble = { g, lp, whine, wg };
    }
    const t = this.now();
    const r = this.rumble;
    r.g.gain.setTargetAtTime(level * 0.5, t, 0.15);
    r.lp.frequency.setTargetAtTime(200 + speed * 30, t, 0.2);
    r.whine.frequency.setTargetAtTime(120 + speed * 28, t, 0.2);
    r.wg.gain.setTargetAtTime(level * Math.min(1, speed / 6) * 0.03, t, 0.2);
  }

  /**
   * A survival enemy's callout (5.0 barks): a shouted voice cadence from where it stands, a squelch
   * after it for radio-carrying humans; synths a clipped, ring-modulated chirp of the same cadence.
   */
  callout(pos: V3, voice: 'synth' | 'human', words: number, urgent: boolean) {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(pos, 0.25);
    const band = this.filter('bandpass', voice === 'synth' ? 1900 : 1300, voice === 'synth' ? 2.5 : 0.9);
    band.connect(o);
    const syl = Math.min(6, 1 + words * 1.4);
    const d = this.voice(band, t, Math.round(syl), voice === 'synth' ? rand(210, 240) : rand(140, 175), voice === 'synth' ? 9 : 6.5, urgent ? 0.36 : 0.26, true);
    if (voice === 'human') this.squelch(o, t + d + 0.02);
    else this.tone(o, 'square', 1500, 900, 0.04, 0.002, 0.05, t + d);
  }

  /** Radio squelch click + hiss tail. */
  private squelch(dest: AudioNode, t: number) {
    this.burst(dest, this.white, 'bandpass', 2400, 1, 0.08, 0.002, 0.06, t);
    this.tone(dest, 'square', 1200, 1200, 0.03, 0.001, 0.02, t);
  }

  /**
   * Security voices. Barks come from the guard's position; radio traffic plays through the player's
   * earpiece-like band-limited channel (no position) so it reads as information, not a location.
   */
  radio(pos: V3 | null, kind: string) {
    if (!this.started) return;
    const t = this.now();
    if (kind === 'door') {
      const o = this.out(pos, 0.4);
      this.metal(o, 160, 0.25, 0.9, [1, 1.52, 2.3]);
      this.burst(o, this.white, 'lowpass', 900, 0.7, 0.2, 0.01, 0.3, t);
      return;
    }
    const band = this.filter('bandpass', 1500, 0.9);
    const drive = this.ctx.createWaveShaper();
    const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) c[i] = Math.tanh(((i / 255) * 2 - 1) * 3);
    drive.curve = c;
    band.connect(drive);
    if (pos) {
      // Bark from the guard plus a quieter radio echo.
      const o = this.out(pos, 0.3);
      drive.connect(o);
      const shout = kind === 'freeze' || kind === 'contact';
      const n = kind === 'huh' ? 2 : kind === 'freeze' ? 3 : 5;
      const d = this.voice(band, t, n, shout ? 165 : 120, shout ? 6 : 7, shout ? 0.32 : 0.16, shout);
      if (kind !== 'huh') this.squelch(o, t + d + 0.02);
    } else {
      const o = this.out(null, 0.05, this.ui);
      const g = this.ctx.createGain();
      g.gain.value = 0.55;
      drive.connect(g).connect(o);
      this.squelch(o, t);
      const d = this.voice(band, t + 0.08, 9, 110, 8, 0.12);
      this.squelch(o, t + 0.12 + d);
    }
  }

  // ------------------------------------------------------------------ UI cues
  waveStart() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.6, this.ui);
    this.tone(o, 'sine', 60, 38, 0.6, 0.01, 1.6, t);
    const lp = this.filter('lowpass', 300, 2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 0.8);
    lp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
    lp.connect(o);
    for (const f of [110, 138.6, 164.8, 220]) {
      for (const det of [-3, 3]) this.tone(lp, 'sawtooth', f + det * 0.3, f + det * 0.3, 0.05, 0.3, 1.9, t);
    }
  }

  waveClear() {
    if (!this.started) return;
    const t = this.now();
    const o = this.out(null, 0.5, this.ui);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(o, 'triangle', f, f, 0.08, 0.005, 0.6, t + i * 0.09));
  }

  uiBlip() {
    if (!this.started) return;
    const o = this.out(null, 0, this.ui);
    this.tone(o, 'sine', 1200, 1200, 0.05, 0.002, 0.05);
  }

  /*
    16.0, the main menu's sounds. They sit in the menu theme's key (D minor, music/Themes.ts MENU_THEME):
    a hover is a soft A (the fifth), a click a falling D to A over a short noise tick, a screen change
    a filtered noise sweep (the glitch the stylesheet draws). Hovers are rate-limited so a mouse
    sweeping a column of buttons ticks, it doesn't buzz.
  */
  private hoverAt = 0;

  uiHover() {
    if (!this.started) return;
    const t = this.now();
    if (t - this.hoverAt < 0.045) return;
    this.hoverAt = t;
    const o = this.out(null, 0, this.ui);
    this.tone(o, 'triangle', 1760, 1740, 0.022, 0.002, 0.045);
    this.burst(o, this.white, 'highpass', 7000, 0.7, 0.012, 0.001, 0.012);
  }

  uiClick() {
    if (!this.started) return;
    const o = this.out(null, 0, this.ui);
    const t = this.now();
    this.burst(o, this.white, 'bandpass', 3200, 1.2, 0.05, 0.001, 0.02, t);
    this.tone(o, 'sine', 1174.7, 1174.7, 0.06, 0.002, 0.07, t);
    this.tone(o, 'triangle', 880, 880, 0.045, 0.002, 0.16, t + 0.045);
  }

  uiGlitch() {
    if (!this.started) return;
    const o = this.out(null, 0, this.ui);
    const t = this.now();
    this.burst(o, this.white, 'bandpass', 1800, 2.5, 0.05, 0.004, 0.16, t, 6500);
    this.tone(o, 'square', 146.8, 73.4, 0.018, 0.003, 0.12, t);
  }

  sparkCrackle(pos: V3) {
    if (!this.started) return;
    const o = this.out(pos, 0.2);
    for (let i = 0; i < 4; i++) this.burst(o, this.white, 'highpass', 3000, 0.7, 0.15, 0.001, 0.02, this.now() + i * rand(0.02, 0.05));
  }
}
