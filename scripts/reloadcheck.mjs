/*
  26.0, the reload synths, rendered and measured (DEV, Node 22+ and Google Chrome).

    npm run dev            # in another terminal (port 5173)
    node scripts/reloadcheck.mjs

  Headless Chrome. (1) Each gun's reload stages rendered offline (an OfflineAudioContext at 48 kHz,
  the recipes from ReloadSynth played the way AudioEngine plays them, dry), and measured: length to
  -40 dB, peak, the spectral centroid and the share of energy under 250 Hz. (2) The live engine in a
  match: what one reload() call costs the main thread (building and scheduling its nodes), per stage.
*/
import { openChrome, sleep, page } from './lib/cdp.mjs';

const URL = process.env.URL ?? 'http://localhost:5173/Gridfall/';
const { ev, open, done } = await openChrome({ port: 9337 });
await open(`${URL}?setting=maglev`);
await sleep(1200);
const offline = await ev(page(`
  const S = await import('/src/audio/ReloadSynth.ts');
  const SR = 48000;
  const LEAK = ${process.env.LEAK === '1'};
  async function render(layers) {
    const len = Math.ceil((S.recipeLength(layers) + 0.1) * SR);
    const ctx = new OfflineAudioContext(1, len, SR);
    const nb = (kind) => { const b = ctx.createBuffer(1, SR, SR), d = b.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < SR; i++) { const w = Math.random() * 2 - 1; if (kind === 'white') d[i] = w; else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } } return b; };
    const bufs = { white: nb('white'), pink: nb('pink'), brown: nb('brown') };
    const env = (peak, a, d, t) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g; };
    const tone = (type, f0, f1, peak, a, d, t) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + a + d); o.start(t); o.stop(t + a + d + 0.05); o.connect(env(peak, a, d, t)).connect(ctx.destination); };
    for (const l of layers) {
      if (l.v === 'tone') tone(l.wave, l.f0, l.f1, l.peak, l.attack, l.decay, l.at);
      else if (l.v === 'metal') l.ratios.forEach((r, i) => tone('sine', l.base * r, l.base * r * 0.995, l.peak / (i + 1), 0.002, l.decay / (1 + i * 0.5), l.at));
      else { const s = ctx.createBufferSource(); s.buffer = bufs[l.color]; const f = ctx.createBiquadFilter(); f.type = l.filter; f.frequency.value = l.f; f.Q.value = l.q;
        if (l.fEnd) { f.frequency.setValueAtTime(l.f, l.at); f.frequency.exponentialRampToValueAtTime(l.fEnd, l.at + l.attack + l.decay); }
        s.connect(f).connect(env(l.peak, l.attack, l.decay, l.at)).connect(ctx.destination); s.start(LEAK ? 0 : l.at, Math.random() * 0.5); s.stop(l.at + l.attack + l.decay + 0.05); }
    }
    return (await ctx.startRendering()).getChannelData(0);
  }
  // Spectrum: 2048-point frames (Hann), radix-2 FFT, energies summed over the frames.
  function spectrum(x) {
    const N = 2048, E = new Float64Array(N / 2);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let o = 0; o + N <= x.length + N / 2; o += N / 2) {
      for (let i = 0; i < N; i++) { re[i] = (x[o + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); im[i] = 0; }
      for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= N; len <<= 1) { const a = (-2 * Math.PI) / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } }
      for (let k = 0; k < N / 2; k++) E[k] += re[k] * re[k] + im[k] * im[k];
    }
    let tot = 0, c = 0, low = 0; for (let k = 1; k < N / 2; k++) { const f = (k * SR) / N; tot += E[k]; c += E[k] * f; if (f < 250) low += E[k]; }
    return { centroid: Math.round(c / tot), lowPct: +((100 * low) / tot).toFixed(1) };
  }
  const rows = [];
  // The generic reload before 26.0 (one for every gun), as layers: with LEAK=1 as it really played.
  const T = (at, wave, f0, f1, peak, attack, decay) => ({ v: 'tone', at, wave, f0, f1, peak, attack, decay });
  const B = (at, color, filter, f, q, peak, attack, decay, fEnd) => ({ v: 'noise', at, color, filter, f, q, peak, attack, decay, fEnd });
  const M = (at, base, peak, decay, ratios) => ({ v: 'metal', at, base, peak, decay, ratios });
  const legacy = {
    out: [T(0, 'square', 1900, 1800, 0.06, 0.001, 0.01), B(0.01, 'white', 'bandpass', 2500, 1.5, 0.18, 0.005, 0.12, 800), B(0.35, 'white', 'lowpass', 1200, 0.7, 0.12, 0.002, 0.08)],
    in: [B(0, 'white', 'bandpass', 900, 1.5, 0.15, 0.01, 0.07, 2500), T(0.08, 'square', 2300, 2200, 0.08, 0.001, 0.012), M(0.08, 1800, 0.05, 0.06, [1, 2.4])],
    rack: [B(0, 'white', 'bandpass', 800, 1.2, 0.2, 0.01, 0.09, 3200), T(0.1, 'square', 2800, 2700, 0.1, 0.001, 0.012), B(0.1, 'white', 'highpass', 2500, 0.7, 0.22, 0.001, 0.05), T(0.12, 'sine', 4000, 3800, 0.03, 0.002, 0.2)],
  };
  for (const st of ['out', 'in', 'rack']) { const x = await render(legacy[st]); let peak = 0, last = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i])); for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.01) last = i;
    rows.push({ gun: 'old (all)', stage: st, layers: legacy[st].length, ms: Math.round((1000 * last) / SR), peak: +peak.toFixed(2), ...spectrum(x) }); }
  const kinds = ['pistol', 'smg', 'rifle', 'shotgun'];
  for (const k of kinds) for (const st of ['out', 'in', 'rack']) {
    const layers = k === 'shotgun' && st === 'rack' ? S.pumpLayers() : S.reloadRecipe(k, st);
    if (!layers.length) continue;
    const x = await render(layers);
    let peak = 0, last = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.01) last = i;
    rows.push({ gun: k, stage: k === 'shotgun' && st === 'rack' ? 'pump' : st, layers: layers.length, ms: Math.round((1000 * last) / SR), peak: +peak.toFixed(2), ...spectrum(x) });
  }
  return rows;`));
console.table(offline);
// The live engine: the main thread's cost of a reload() call.
const live = await ev(page(`
  __dev.start('tdm'); __dev.god(true); await sl(2000);
  const a = __game.audio; a.start();
  await sl(300);
  const out = {};
  for (const k of ['pistol', 'smg', 'rifle', 'shotgun']) { let t = 0, n = 0;
    for (let i = 0; i < 40; i++) for (const st of ['out', 'in', 'rack']) { const t0 = performance.now(); a.reload(st, k); t += performance.now() - t0; n++; await sl(5); }
    out[k] = +(t / n).toFixed(4); }
  let t = 0; for (let i = 0; i < 40; i++) { const t0 = performance.now(); a.pump(); t += performance.now() - t0; await sl(5); }
  out.pump = +(t / 40).toFixed(4);
  return { msPerCall: out, state: a.ctx.state };`));
console.log(JSON.stringify({ offline, live }));
done(0);
