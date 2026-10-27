import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Combatant, TeamId } from './Team';
import { FRAG, FRAG_BLAST, stepBody, type Body } from './Explosives';
import type { Blasts } from './Blast';

/*
  90.0: frag grenades in flight (Explosives.ts: the body, the blast). A fixed pool drawn as one
  InstancedMesh; each one bounces (a clink by the surface it hit), rolls to a stop and goes off when
  its fuse runs out. The bots read `live` (what is on the ground near them, whose it is, how long it
  has left) to get away from it.
*/

export interface LiveGrenade {
  readonly body: Body;
  /** Seconds to the bang. */
  fuse: number;
  /** Seconds since it left the hand. */
  age: number;
  by: Combatant | null;
  team: TeamId;
  active: boolean;
  spin: THREE.Quaternion;
  axis: THREE.Vector3;
  rate: number;
}

const N = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _roll = new THREE.Vector3();

/** The grenade's model: a ribbed body, the fuse's head, the spoon (olive drab, dull steel). */
function grenadeGeometry() {
  const body = new THREE.SphereGeometry(0.045, 10, 8);
  body.scale(1, 1.22, 1);
  const head = new THREE.CylinderGeometry(0.016, 0.02, 0.03, 8);
  head.translate(0, 0.064, 0);
  const spoon = new THREE.BoxGeometry(0.012, 0.075, 0.016);
  spoon.translate(0.03, 0.038, 0);
  const parts = [body, head, spoon];
  const colours = [[0.16, 0.19, 0.12], [0.32, 0.33, 0.34], [0.38, 0.39, 0.4]];
  const geos = parts.map((g, i) => {
    const n = g.toNonIndexed();
    const c = new Float32Array(n.attributes.position.count * 3);
    for (let j = 0; j < c.length; j += 3) c.set(colours[i], j);
    n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
    return n;
  });
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = new Float32Array(count * 3);
    let o = 0;
    for (const g of geos) {
      a.set(g.attributes[name].array as Float32Array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(a, 3));
  }
  return out;
}

export class Grenades {
  readonly live: LiveGrenade[] = [];
  private mesh: THREE.InstancedMesh;
  private hitSurface = { surface: 'concrete' };
  /** DEV: thrown, gone off. */
  stats = { thrown: 0, blasts: 0, dropped: 0, botThrows: 0, dodges: 0, looks: 0, range: 0, mates: 0, noArc: 0 };
  /** The sim time of each team's last bot throw (the bots space theirs out). */
  teamLast: Partial<Record<TeamId, number>> = {};
  /** A grenade left a hand (the barks, the bots' "frag out"). */
  onThrow: (g: LiveGrenade) => void = () => {};

  constructor(scene: THREE.Scene, private col: CollisionWorld, private audio: AudioEngine, private blasts: Blasts) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.mesh = new THREE.InstancedMesh(grenadeGeometry(), mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.live.push({ body: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: false }, fuse: 0, age: 0, by: null, team: 'omega', active: false, spin: new THREE.Quaternion(), axis: new THREE.Vector3(1, 0, 0), rate: 0 });
    }
    scene.add(this.mesh);
  }

  /** Throws one from `from` at `vel` (m/s); `fuse` left on it (a cooked one less). Null if the pool is full. */
  throw(from: THREE.Vector3, vel: THREE.Vector3, by: Combatant | null, fuse = FRAG.fuse): LiveGrenade | null {
    const g = this.live.find((x) => !x.active);
    if (!g) {
      this.stats.dropped++;
      return null;
    }
    g.active = true;
    g.body.pos.copy(from);
    g.body.vel.copy(vel);
    g.body.grounded = false;
    g.fuse = fuse;
    g.age = 0;
    g.by = by;
    g.team = by?.team ?? 'omega';
    g.spin.identity();
    g.axis.set(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize();
    g.rate = 9 + Math.random() * 6;
    this.stats.thrown++;
    this.onThrow(g);
    return g;
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < N; i++) {
      const g = this.live[i];
      if (!g.active) continue;
      any = true;
      g.age += dt;
      g.fuse -= dt;
      const hard = stepBody(this.col, g.body, dt, FRAG, this.hitSurface);
      if (hard > 1.2) this.audio.grenadeBounce(g.body.pos, Math.min(1, hard / 10), this.hitSurface.surface);
      // Tumbling in the air, slowing as it rolls.
      const sp = g.body.grounded ? Math.hypot(g.body.vel.x, g.body.vel.z) / FRAG.r : g.rate;
      if (sp > 0.01) {
        // Rolling: about the axis across its way.
        const ax = g.body.grounded ? _roll.set(g.body.vel.z, 0, -g.body.vel.x).normalize() : g.axis;
        g.spin.premultiply(_q.setFromAxisAngle(ax, sp * dt));
      }
      if (g.fuse <= 0) {
        g.active = false;
        this.stats.blasts++;
        this.mesh.setMatrixAt(i, _zero);
        // (At the floor under its middle: the scorch lies on it.)
        const at = g.body.pos.clone();
        if (g.body.grounded) at.y -= FRAG.r;
        // The face it lies on (a floor: up; still in the air: up too).
        this.blasts.go(at, _up, FRAG_BLAST, g.by, 'FRAG');
        continue;
      }
      _m.compose(g.body.pos, g.spin, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Every grenade gone (a level reset, a round). */
  clear() {
    this.teamLast = {};
    for (let i = 0; i < N; i++) {
      this.live[i].active = false;
      this.mesh.setMatrixAt(i, _zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
