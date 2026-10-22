import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LightPool, POOLED_LAYER, pickTop, stepSlots } from './LightPool';
import { PRESETS } from './Performance';

const state = (n: number, size: number) => ({ weight: new Float32Array(n), slotOf: new Int16Array(n).fill(-1), slots: new Int16Array(size).fill(-1) });
/** A wanted-set mask of `n` sources from their indices. */
const mask = (n: number, ids: number[]) => {
  const m = new Uint8Array(n);
  for (const i of ids) m[i] = 1;
  return m;
};

describe('light pool', () => {
  it('picks the best sources, never one that lights nothing on screen', () => {
    const top = (scores: number[], size: number) => [...pickTop(scores, size, new Uint8Array(scores.length), [])];
    expect(top([5, 0, 9, 1, 7], 3)).toEqual([1, 0, 1, 0, 1]);
    expect(top([0, 0, 3], 3)).toEqual([0, 0, 1]);
    // Ties keep the lower index (no flicker between equals).
    expect(top([2, 2, 2], 2)).toEqual([1, 1, 0]);
  });

  it('a snap fills the slots at full weight; a change fades instead of popping', () => {
    const s = state(4, 2);
    stepSlots(mask(4, [0, 1]), s.weight, s.slotOf, s.slots, 0, true);
    expect([...s.weight]).toEqual([1, 1, 0, 0]);
    // Source 2 replaces 1: 1 fades out and holds its slot; 2 waits for it.
    stepSlots(mask(4, [0, 2]), s.weight, s.slotOf, s.slots, 0.1, false);
    expect(s.weight[1]).toBeCloseTo(0.6);
    expect(s.weight[2]).toBe(0);
    for (let i = 0; i < 3; i++) stepSlots(mask(4, [0, 2]), s.weight, s.slotOf, s.slots, 0.1, false);
    expect(s.weight[1]).toBe(0);
    expect(s.slotOf[1]).toBe(-1);
    // Then 2 takes the freed slot and brightens.
    for (let i = 0; i < 3; i++) stepSlots(mask(4, [0, 2]), s.weight, s.slotOf, s.slots, 0.1, false);
    expect(s.slotOf[2]).toBeGreaterThanOrEqual(0);
    expect(s.weight[2]).toBeGreaterThan(0.5);
    expect(s.weight[0]).toBe(1);
  });

  it('never holds more sources than slots', () => {
    const s = state(10, 3);
    for (let k = 0; k < 50; k++) {
      const want = mask(10, [k % 10, (k * 3) % 10, (k * 7 + 1) % 10]);
      stepSlots(want, s.weight, s.slotOf, s.slots, 0.05, k % 13 === 0);
      expect([...s.weight].filter((w) => w > 0).length).toBeLessThanOrEqual(3);
      for (let i = 0; i < 10; i++) if (s.weight[i] > 0) expect(s.slots[s.slotOf[i]]).toBe(i);
    }
  });

  it('a scene keeps a fixed number of rendered lights: the sources move off the camera layer', () => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    cam.position.set(0, 2, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    for (let i = 0; i < 30; i++) {
      const l = new THREE.PointLight(0xffffff, 10 + i, 12, 2);
      l.position.set((i - 15) * 3, 3, 0);
      scene.add(l);
    }
    // Behind the camera: lights nothing on screen.
    const back = new THREE.PointLight(0xff0000, 1000, 5, 2);
    back.position.set(0, 2, 40);
    scene.add(back);
    const muzzle = new THREE.PointLight(0xffa860, 0, 14, 2);
    muzzle.userData.unpooled = true;
    scene.add(muzzle);
    const pool = new LightPool(scene, 8);
    const rendered = () => {
      const r: THREE.PointLight[] = [];
      scene.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight && o.layers.test(cam.layers)) r.push(o as THREE.PointLight);
      });
      return r;
    };
    // Eight slots plus the muzzle light, whatever the view.
    expect(rendered().length).toBe(9);
    expect(back.layers.test(cam.layers)).toBe(false);
    expect(back.layers.isEnabled(POOLED_LAYER)).toBe(true);
    pool.update(cam, 0.016);
    const lit = rendered().filter((l) => l.intensity > 0 && l !== muzzle);
    expect(lit.length).toBe(8);
    expect(lit.some((l) => l.color.equals(back.color))).toBe(false);
    // Hidden sources (a sign's light off on Power Saving) light nothing.
    for (const l of pool.sources) l.visible = false;
    for (let i = 0; i < 20; i++) pool.update(cam, 0.05);
    expect(rendered().filter((l) => l.intensity > 0 && l !== muzzle).length).toBe(0);
    pool.dispose();
    expect(back.layers.test(cam.layers)).toBe(true);
  });

  it('a map with fewer lights than the budget keeps its own count (no empty slots to shade)', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 4; i++) scene.add(new THREE.PointLight(0xffffff, 5, 9, 2));
    const pool = new LightPool(scene, 16);
    let drawn = 0;
    scene.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight && o.layers.test(new THREE.Layers())) drawn++;
    });
    expect(pool.size).toBe(4);
    expect(drawn).toBe(4);
  });

  it('every preset has a budget under the knee (~24 lights, where the shader cost climbs)', () => {
    expect(PRESETS.power.lights).toBeLessThan(PRESETS.balanced.lights);
    expect(PRESETS.balanced.lights).toBeLessThanOrEqual(16);
    expect(PRESETS.high.lights).toBeLessThan(24);
    expect(PRESETS.high.lights).toBeGreaterThan(PRESETS.balanced.lights);
  });
});
