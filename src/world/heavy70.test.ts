import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticBuilder } from './Builder';
import { Dresser } from './Dress';
import { hit, readGlb } from '../entities/weapons/glbRead';

/* 70.0: the heavy kit (tools/blender/props_heavy.py) and the dresser's containers and regions. */

const part = (w: number, h: number, d: number, role: string) => ({ geo: new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), role });
const KIT = { container: [part(2.44, 2.6, 6.06, 'paint')], container40: [part(2.44, 2.6, 12.19, 'paint')], truck: [part(2.4, 2.75, 7.2, 'paint')] };
const mats = { paint: new THREE.MeshBasicMaterial(), metal: new THREE.MeshBasicMaterial(), dark: new THREE.MeshBasicMaterial() };

describe('70.0: the dresser: containers and regions', () => {
  it('a container box (20 ft or 40 ft) is the model in its paint, another size in the paint stays a box', () => {
    StaticBuilder.registry = [];
    const b = new StaticBuilder();
    const d = new Dresser(b, KIT, mats);
    const blue = new THREE.MeshBasicMaterial();
    d.rule(blue, 'container', { paint: blue });
    b.add(new THREE.BoxGeometry(6.06, 2.6, 2.44), blue, 0, 1.3, 0);
    b.add(new THREE.BoxGeometry(2.44, 2.6, 12.19), blue, 10, 1.3, 0);
    b.add(new THREE.BoxGeometry(2.8, 3.2, 2.8), blue, 20, 1.6, 0);
    expect(d.stats.byKind.container).toBe(1);
    expect(d.stats.byKind.container40).toBe(1);
    // The cab-sized box in the same paint is drawn as itself (the paint itself, not a copy).
    expect(StaticBuilder.registry!.filter((p) => p.mat === blue)).toHaveLength(1);
    StaticBuilder.registry = null;
  });

  it('a replaced region shows the model and hides what the map draws in it; a ruled box in it is still dressed', () => {
    StaticBuilder.registry = [];
    const b = new StaticBuilder();
    const d = new Dresser(b, KIT, mats);
    const body = new THREE.MeshBasicMaterial(), cont = new THREE.MeshBasicMaterial();
    d.rule(cont, 'container', { paint: cont });
    expect(d.replace('truck', [0, 0, 0], [2.4, 2.75, 7.2], { rotY: Math.PI })).toBe(true);
    b.add(new THREE.BoxGeometry(2.4, 2.3, 2), body, 1.2, 1.15, 1);
    b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.3), body, -0.1, 0.5, 2);
    b.add(new THREE.BoxGeometry(1, 1, 1), body, 9, 0.5, 9);
    b.add(new THREE.BoxGeometry(6.06, 2.6, 2.44), cont, 1.2, 1.3, 3.6);
    const reg = StaticBuilder.registry!;
    expect(reg.filter((p) => p.mat === body)).toHaveLength(1);
    expect(d.stats.byKind.truck).toBe(1);
    expect(d.stats.byKind.container).toBe(1);
    StaticBuilder.registry = null;
  });
});

describe('70.0: the heavy kit', () => {
  const g = readGlb('props/heavy');
  it('its machines, in roles the maps paint, in budget', () => {
    expect(Object.keys(g.nodes).sort()).toEqual(['apc', 'bowser', 'bus', 'car', 'container', 'container40', 'forklift', 'generator', 'jeep', 'semi', 'truck', 'truck_open']);
    const roles = ['paint', 'metal', 'rubber', 'glass', 'canvas', 'rust', 'light', 'dark', 'chrome'];
    for (const parts of Object.values(g.nodes)) for (const p of parts) expect(roles).toContain(p.role);
    const tris = (n: string) => g.nodes[n].reduce((a, p) => a + p.tris.length, 0);
    expect(tris('container')).toBeLessThan(1600);
    expect(g.tris).toBeLessThan(40000);
  });

  it("the bus's doors and windows are open where the Desert's colliders are (the walk-through), its other bays closed", () => {
    const bus = g.nodes.bus.flatMap((p) => p.tris);
    const blocked = (o: number[], d: number[]) => bus.some((t) => (hit(o, d, t) ?? Infinity) < 3);
    // Across the bus at the windows' height through the west side's openings (z local -0.5, 1.8, 4.0)…
    for (const z of [-0.5, 1.8, 4.0]) expect(blocked([-2, 1.7, z], [1, 0, 0])).toBe(false);
    // …into the side door (z -2.5) at waist height, and through the tail door (x 0) lengthwise to the front's inside.
    expect(blocked([-2, 1.0, -2.5], [1, 0, 0])).toBe(false);
    expect(bus.some((t) => (hit([0, 1.0, -6], [0, 0, 1], t) ?? Infinity) < 1.2)).toBe(false);
    // A closed bay (z -4.2: the collider is whole there) is a pane.
    expect(blocked([-2, 1.7, -4.2], [1, 0, 0])).toBe(true);
  });
});
