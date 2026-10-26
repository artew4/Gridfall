import { Instruments, TrackBus } from '../audio/music/Instruments';
import { PATTERN_THEMES, type ThemeDef } from '../audio/music/Themes';
import { mulberry32 } from '../core/math';

/*
  25.0 (DEV): what a procedural theme sounds like, measured instead of heard. Every layer of a theme is
  rendered offline (an OfflineAudioContext, all layers on at `intensity`) for `seconds`, then rendered
  again through a high-pass at 1 kHz and at 2.5 kHz: the share of the energy above each (a siren or a
  beeping lead lives up there; drums and drones don't), the RMS and the peak level.
*/
async function render(def: ThemeDef, seconds: number, intensity: number, highpass: number | null) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  let dest: AudioNode = ctx.destination;
  if (highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    hp.Q.value = 0.7;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = highpass;
    hp2.Q.value = 0.7;
    hp.connect(hp2).connect(ctx.destination);
    dest = hp;
  }
  const I = new Instruments(ctx as unknown as AudioContext);
  const reverb = I.makeReverb(dest);
  // As PatternTheme mixes it: the theme's gain, the bus (its output opened), each layer at its level.
  const mix = ctx.createGain();
  mix.gain.value = def.gain;
  mix.connect(dest);
  const bus = new TrackBus(ctx as unknown as AudioContext, mix, reverb, def.bpm);
  bus.out.gain.value = 1;
  const layerBus = new Map(def.layers.map((l) => {
    const g = ctx.createGain();
    g.gain.value = l.level;
    g.connect(bus[l.part]);
    return [l, { ...bus, drums: g, synth: g, bass: g, lead: g, side: g, duck: (t: number, d: number, r: number) => bus.duck(t, d, r) } as unknown as TrackBus];
  }));
  const s16 = 60 / def.bpm / 4;
  const rnd = mulberry32(3);
  const steps = Math.floor((seconds - 2) / s16);
  for (let n = 0; n < steps; n++) {
    const step = n % 16, bar = Math.floor(n / 16);
    const chord = def.chords[Math.floor(bar / def.barsPerChord) % def.chords.length];
    for (const l of def.layers) if (l.on <= intensity) l.play({ I, bus: layerBus.get(l)!, t: 0.05 + n * s16, step, bar, chord, s16, intensity, rnd });
  }
  const buf = await ctx.startRendering();
  let sum = 0, peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      sum += d[i] * d[i];
      peak = Math.max(peak, Math.abs(d[i]));
    }
  }
  return { energy: sum, rms: Math.sqrt(sum / (buf.length * buf.numberOfChannels)), peak };
}

export async function musicSpectrum(opts: { ids?: string[]; seconds?: number; intensity?: number; defs?: Record<string, ThemeDef> } = {}) {
  const seconds = opts.seconds ?? 12;
  const intensity = opts.intensity ?? 1;
  const defs = { ...PATTERN_THEMES, ...(opts.defs ?? {}) };
  const out: Record<string, unknown> = {};
  for (const id of opts.ids ?? Object.keys(defs)) {
    const def = defs[id];
    const all = await render(def, seconds, intensity, null);
    const hf1 = await render(def, seconds, intensity, 1000);
    const hf2 = await render(def, seconds, intensity, 2500);
    const db = (x: number) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
    out[id] = { above1kPct: +((100 * hf1.energy) / all.energy).toFixed(2), above2_5kPct: +((100 * hf2.energy) / all.energy).toFixed(2), rmsDb: db(all.rms), peakDb: db(all.peak) };
  }
  return out;
}

/**
 * 59.0 (DEV): a theme rendered to a WAV to listen to (base64), as the game mixes it (its limiter), over
 * `parts`: [bars, intensity] each (the layers in as the fight would bring them).
 */
export async function musicWav(opts: { id?: string; parts?: [number, number][] } = {}) {
  const def = PATTERN_THEMES[opts.id ?? 'desert_theme'];
  const parts = opts.parts ?? [[8, 0], [8, 0.35], [8, 0.65], [16, 1]];
  const s16 = 60 / def.bpm / 4;
  const bars = parts.reduce((a, [b]) => a + b, 0);
  const sr = 44100;
  const seconds = bars * 16 * s16 + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -16;
  lim.ratio.value = 4;
  lim.attack.value = 0.01;
  lim.release.value = 0.25;
  lim.connect(ctx.destination);
  const I = new Instruments(ctx as unknown as AudioContext);
  const reverb = I.makeReverb(lim);
  const mix = ctx.createGain();
  mix.gain.value = def.gain;
  mix.connect(lim);
  const bus = new TrackBus(ctx as unknown as AudioContext, mix, reverb, def.bpm);
  bus.out.gain.value = 1;
  const layerBus = new Map(def.layers.map((l) => {
    const g = ctx.createGain();
    g.gain.value = l.level;
    g.connect(bus[l.part]);
    return [l, { ...bus, drums: g, synth: g, bass: g, lead: g, side: g, duck: (t: number, d: number, r: number) => bus.duck(t, d, r) } as unknown as TrackBus];
  }));
  const rnd = mulberry32(3);
  let bar = 0;
  for (const [n, intensity] of parts) {
    for (let b = 0; b < n; b++, bar++) for (let step = 0; step < 16; step++) {
      const chord = def.chords[Math.floor(bar / def.barsPerChord) % def.chords.length];
      const t = 0.05 + (bar * 16 + step) * s16;
      for (const l of def.layers) if (l.on <= intensity) l.play({ I, bus: layerBus.get(l)!, t, step, bar, chord, s16, intensity, rnd });
    }
  }
  const buf = await ctx.startRendering();
  // 16-bit PCM WAV.
  const len = buf.length, out = new DataView(new ArrayBuffer(44 + len * 4));
  const w = (o: number, sstr: string) => [...sstr].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + len * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, len * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < len; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  let bin = '';
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
