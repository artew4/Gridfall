import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { readGlb } from '../entities/weapons/glbRead';

/* 71.0: the Desert's architecture kit (tools/blender/props_desert.py) and how its wall pieces sit. */

describe('71.0: the architecture kit', () => {
  const g = readGlb('props/desert');
  it('its pieces, in roles the Desert paints, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['ac', 'antenna', 'awning', 'brace', 'dish', 'door', 'head', 'jamb', 'lamp', 'palm', 'pole', 'roof_tank', 'shutter', 'sill', 'tent', 'tower_tank']);
    const roles = ['trim', 'wood', 'metal', 'canvas', 'plastic', 'bark', 'frond', 'enamel', 'dark'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    expect(g.tris).toBeLessThan(16000);
  });

  it('the frame pieces are a hand deep (nothing standing off a wall to be taken for cover)', () => {
    for (const n of ['jamb', 'head', 'sill', 'shutter', 'door']) {
      let lo = Infinity, hi = -Infinity;
      for (const p of g.nodes[n]) for (const t of p.tris) for (const v of t) (lo = Math.min(lo, v[2])), (hi = Math.max(hi, v[2]));
      expect(hi - lo).toBeLessThan(0.12);
    }
  });
});

describe('71.0: a wall piece sits on the face by its back', () => {
  it('a door leaf placed on a face is all in front of it', () => {
    StaticBuilder.registry = [];
    const b = new StaticBuilder();
    const kit = { door: [{ geo: new THREE.BoxGeometry(1, 2.1, 0.05).translate(0, 1.05, 0.01), role: 'wood' }] };
    const d = new Dresser(b, kit, { wood: new THREE.MeshBasicMaterial() });
    d.place('door', new THREE.Matrix4().makeTranslation(0, 0, 4));
    const box = StaticBuilder.registry![0].box;
    expect(box.min.z).toBeCloseTo(4, 5);
    expect(box.max.z).toBeCloseTo(4.05, 5);
    StaticBuilder.registry = null;
  });
});
