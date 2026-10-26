import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 72.0: the neon street kit (tools/blender/props_neon.py) and the dresser's runs and raw instances. */

describe('72.0: the street kit', () => {
  const g = readGlb('props/neon');
  it('its props, in roles the maps paint, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['ac_roof', 'ac_wall', 'bench', 'bike', 'bollard', 'dumpster', 'ecab', 'garbage', 'lantern_caps', 'planter', 'upole', 'vending', 'yatai']);
    const roles = ['paint', 'metal', 'dark', 'plastic', 'rubber', 'chrome', 'glass', 'light', 'concrete', 'wood', 'leaf', 'glow'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(16000);
  });

  it("a vending machine's front stays behind the game's lit canvas (0.405 m out from its centre)", () => {
    let hi = -Infinity;
    for (const p of g.nodes.vending) if (p.role !== 'glow' && p.role !== 'paint') continue; else for (const t of p.tris) for (const v of t) if (v[1] > 0.2 && v[1] < 1.8 && Math.abs(v[0]) < 0.45) hi = Math.max(hi, v[2]);
    expect(hi).toBeLessThan(0.405);
  });
});

describe('72.0: the dresser', () => {
  const part = (w: number, h: number, d: number, role: string) => ({ geo: new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), role });
  it('a planter run is a row of troughs, 1.5 m each', () => {
    const b = new StaticBuilder();
    const d = new Dresser(b, { planter: [part(1.5, 0.9, 0.6, 'concrete')] }, { concrete: new THREE.MeshBasicMaterial() });
    const mat = new THREE.MeshBasicMaterial();
    d.rule(mat, 'planter');
    b.add(new THREE.BoxGeometry(4.0, 0.9, 0.6), mat, 0, 0.45, 0);
    expect(d.stats.byKind.planter).toBe(3);
  });
  it('raw instances keep the model about its own origin (a lantern frame round the lantern)', () => {
    const b = new StaticBuilder();
    const caps = new THREE.BoxGeometry(0.2, 1.0, 0.2);
    const d = new Dresser(b, { lantern_caps: [{ geo: caps, role: 'wood' }] }, { wood: new THREE.MeshBasicMaterial() });
    const g = new THREE.Group();
    d.instances('lantern_caps', [new THREE.Matrix4()], g, undefined, { raw: true });
    const im = g.children[0] as THREE.InstancedMesh;
    im.geometry.computeBoundingBox();
    expect(im.geometry.boundingBox!.min.y).toBeCloseTo(-0.5, 5);
  });
});
