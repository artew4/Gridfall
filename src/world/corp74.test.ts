import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 74.0: Maglev's corporate kit (tools/blender/props_corp.py) and the dresser's hiding rule. */

describe('74.0: the corporate kit', () => {
  const g = readGlb('props/corp');
  it('its props, in roles the hall paints, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['cbench', 'cplanter', 'kiosk', 'lcart', 'mcart', 'tdoor', 'tgate', 'ticket']);
    const roles = ['white', 'offwhite', 'steel', 'teal', 'glass', 'screen', 'dark', 'leaf', 'soil', 'light', 'case'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(8000);
  });
  it("a planter's plants stay low over its rim (they'd read as cover they aren't)", () => {
    let top = -Infinity, rim = -Infinity;
    for (const p of g.nodes.cplanter) for (const t of p.tris) for (const v of t) {
      if (p.role === 'leaf') top = Math.max(top, v[1]);
      else rim = Math.max(rim, v[1]);
    }
    expect(top - rim).toBeLessThan(0.25);
  });
  it("a train door's surround leaves the 1.6 x 2.1 opening clear", () => {
    for (const p of g.nodes.tdoor) for (const t of p.tris) for (const v of t) expect(Math.abs(v[0]) > 0.79 || v[1] > 2.09).toBe(true);
  });
});

describe('74.0: hidden boxes', () => {
  it("a material ruled 'hide' is drawn no more (the planters' flat leaves under the model's plants)", () => {
    StaticBuilder.registry = [];
    const b = new StaticBuilder();
    const d = new Dresser(b, {}, {});
    const leaves = new THREE.MeshBasicMaterial();
    d.rule(leaves, 'hide');
    b.add(new THREE.BoxGeometry(2, 0.05, 1), leaves, 0, 1, 0);
    expect(StaticBuilder.registry!).toHaveLength(0);
    StaticBuilder.registry = null;
  });
});
