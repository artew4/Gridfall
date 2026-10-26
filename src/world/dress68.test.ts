import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 68.0: the dresser (Dress.ts) on stand-in models, and the military kit as the game reads it. */

const part = (w: number, h: number, d: number, role: string) => ({ geo: new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), role });
const KIT = {
  crate: [part(1, 0.6, 0.6, 'wood'), { geo: new THREE.BoxGeometry(0.5, 0.3, 0.6).translate(0, 0.3, 0), role: 'label' }],
  hesco: [part(1, 1, 1, 'liner')],
  bag: [part(0.5, 0.13, 0.27, 'canvas')],
};
const mats = { wood: new THREE.MeshBasicMaterial(), label: new THREE.MeshBasicMaterial(), liner: new THREE.MeshBasicMaterial(), canvas: new THREE.MeshBasicMaterial() };

function setup() {
  StaticBuilder.registry = [];
  const b = new StaticBuilder();
  const d = new Dresser(b, KIT, mats);
  return { b, d };
}

describe('68.0: the dresser', () => {
  it('a crate box is drawn as the crate fitted to its bounds (turned along its long side), the stencil its own', () => {
    const { b, d } = setup();
    const crateMat = new THREE.MeshBasicMaterial(), stencil = new THREE.MeshBasicMaterial();
    d.rule(crateMat, 'crate', { label: stencil });
    b.add(new THREE.BoxGeometry(0.6, 0.5, 1.4), crateMat, 3, 0.25, -2);
    const reg = StaticBuilder.registry!;
    expect(reg.some((p) => p.mat === crateMat)).toBe(false);
    const all = new THREE.Box3();
    for (const p of reg) all.union(p.box);
    expect(all.min.x).toBeCloseTo(2.7, 3);
    expect(all.max.x).toBeCloseTo(3.3, 3);
    expect(all.min.z).toBeCloseTo(-2.7, 3);
    expect(all.max.z).toBeCloseTo(-1.3, 3);
    expect(all.min.y).toBeCloseTo(0, 3);
    expect(all.max.y).toBeCloseTo(0.5, 3);
    expect(reg.some((p) => p.mat === stencil)).toBe(true);
    StaticBuilder.registry = null;
  });

  it('HESCO cells down a run, a metre each; a material with no rule is a box as before', () => {
    const { b, d } = setup();
    const hesco = new THREE.MeshBasicMaterial(), plain = new THREE.MeshBasicMaterial();
    d.rule(hesco, 'hesco');
    b.add(new THREE.BoxGeometry(1.1, 1.5, 5.2), hesco, 0, 0.75, 0);
    b.add(new THREE.BoxGeometry(1, 1, 1), plain, 9, 0.5, 9);
    expect(d.stats.byKind.hesco).toBe(5);
    expect(StaticBuilder.registry!.filter((p) => p.mat === plain)).toHaveLength(1);
    StaticBuilder.registry = null;
  });

  it('sandbags in courses (bond-wise: half bags at the ends of every other course), instanced, the wall casting the shadow', () => {
    const { b, d } = setup();
    const bags = new THREE.MeshBasicMaterial();
    d.rule(bags, 'sandbag');
    // 1.92 m long, 0.54 tall, 0.28 deep: 4 courses of 4 bags, the 2nd and 4th 5 pieces.
    b.add(new THREE.BoxGeometry(1.92, 0.54, 0.28), bags, 0, 0.27, 0);
    const scene = new THREE.Group();
    d.finish(scene);
    const inst = scene.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(inst.count).toBe(4 + 5 + 4 + 5);
    expect(inst.castShadow).toBe(false);
    expect(scene.children.some((o) => o.userData.shadowOnly && o.castShadow)).toBe(true);
    StaticBuilder.registry = null;
  });
});

describe('68.0: the military kit', () => {
  const g = readGlb('props/military');
  it('its props, each in roles the maps paint, in budget; the bag light (walls are hundreds)', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['bag', 'case', 'crate', 'drum', 'hesco']);
    const roles = ['wood', 'metal', 'rope', 'label', 'plastic', 'paint', 'canvas', 'liner', 'wire'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    const tris = (n: string) => g.nodes[n].reduce((a, p) => a + p.tris.length, 0);
    expect(tris('bag')).toBeLessThanOrEqual(64);
    expect(tris('hesco')).toBeLessThan(600);
    expect(g.tris).toBeLessThan(8000);
    expect(g.nodes.crate.some((p) => p.role === 'label')).toBe(true);
  });
});
