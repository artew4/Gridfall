import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 73.0: the port kit (tools/blender/props_port.py) and the dresser's tiling through a box. */

describe('73.0: the port kit', () => {
  const g = readGlb('props/port');
  it('its parts, in roles the ports paint, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['bitt', 'bogie', 'crane_girder', 'crane_house', 'crane_leg', 'rack_beam', 'rack_frame', 'rail_panel', 'trolley']);
    const roles = ['paint', 'metal', 'dark', 'mesh', 'glass', 'light'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(10000);
  });
  it("a handrail panel is closed from its kick plate to its top tube (its collider stops rounds and sight)", () => {
    // A ray through the panel's face at every height from 0.05 to 1.0 m meets something.
    const tris = g.nodes.rail_panel.flatMap((p) => p.tris);
    for (let y = 0.05; y <= 1.0; y += 0.05) {
      const hitAny = tris.some(([a, b, c]) => {
        const xs = [a[0], b[0], c[0]], ys = [a[1], b[1], c[1]];
        return Math.min(...xs) <= 0.1 && Math.max(...xs) >= 0.1 && Math.min(...ys) <= y && Math.max(...ys) >= y;
      });
      expect(hitAny).toBe(true);
    }
  });
});

describe('73.0: tiling through a box', () => {
  it("a crane leg's height is stacked from 2 m pieces, the box hidden, the pieces filling it", () => {
    StaticBuilder.registry = [];
    const b = new StaticBuilder();
    const d = new Dresser(b, { crane_leg: [{ geo: new THREE.BoxGeometry(1.2, 2, 1.2).translate(0, 1, 0), role: 'paint' }] }, { paint: new THREE.MeshBasicMaterial() });
    const leg = new THREE.MeshBasicMaterial();
    d.tile('crane_leg', [-0.6, 0, -0.6], [0.6, 20, 0.6], 'y', 2);
    b.add(new THREE.BoxGeometry(1.2, 20, 1.2), leg, 0, 10, 0);
    expect(d.stats.byKind.crane_leg).toBe(10);
    const reg = StaticBuilder.registry!;
    expect(reg.some((p) => p.mat === leg)).toBe(false);
    const all = new THREE.Box3();
    for (const p of reg) all.union(p.box);
    expect(all.max.y).toBeCloseTo(20, 4);
    expect(all.min.y).toBeCloseTo(0, 4);
    StaticBuilder.registry = null;
  });
});
