import * as THREE from 'three';
import type { CollisionWorld, RayHit } from '../world/Collision';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Effects } from './Effects';
import type { Blasts } from './Blast';
import type { Combatant, TeamId } from './Team';
import type { Enemy } from '../enemies/Enemy';
import { ROCKET, ROCKET_BLAST } from './Explosives';
import { rand } from '../core/math';

/*
  90.1: rockets in flight (the launcher's). A fixed pool drawn as one InstancedMesh (the warhead, the
  body, the fins); each flies straight and fast with a little drop, its motor's flame and a smoke trail
  behind it, its hiss following it through the air. It goes off at the first thing in its way (a wall,
  the ground, a body of the other side) or at the end of its motor's reach.
*/

interface Rocket {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Metres since the last smoke puff. */
  puff: number;
  by: Combatant | null;
  team: TeamId;
  hiss: { move(p: THREE.Vector3): void; stop(): void } | null;
}

/** The rocket's model along -z (its nose forward), metres. */
function rocketGeometry() {
  const parts: [THREE.BufferGeometry, [number, number, number]][] = [];
  const nose = new THREE.CylinderGeometry(0.008, 0.045, 0.2, 10);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -0.3);
  parts.push([nose, [0.36, 0.38, 0.27]]);
  const bulb = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 10);
  bulb.rotateX(Math.PI / 2);
  bulb.translate(0, 0, -0.16);
  parts.push([bulb, [0.36, 0.38, 0.27]]);
  const body = new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, 0.09);
  parts.push([body, [0.2, 0.21, 0.22]]);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.BoxGeometry(0.005, 0.07, 0.08);
    fin.translate(0, 0.045, 0.27);
    fin.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
    parts.push([fin, [0.2, 0.21, 0.22]]);
  }
  let n = 0;
  const flat = parts.map(([g, c]) => {
    const f = g.toNonIndexed();
    n += f.attributes.position.count;
    return [f, c] as const;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of flat) {
    pos.set(g.attributes.position.array as Float32Array, o);
    nor.set(g.attributes.normal.array as Float32Array, o);
    for (let i = 0; i < g.attributes.position.count; i++) col.set(c, o + i * 3);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const N = 8;
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _fwd = new THREE.Vector3(0, 0, -1);
const _d = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _c = new THREE.Vector3();
const _hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

export interface RocketWorld {
  /** Bodies a rocket can strike (alive or not: it checks). */
  bodies(): readonly Combatant[];
}

export class Rockets {
  private pool: Rocket[] = [];
  private mesh: THREE.InstancedMesh;
  /** DEV: fired, gone off (by what: a wall or the ground, a body, the end of its reach). */
  stats = { fired: 0, wall: 0, body: 0, spent: 0, botFired: 0 };
  /** 92.0: each team's last bot rocket (the bots space theirs out). */
  teamLast: Partial<Record<TeamId, number>> = {};

  constructor(scene: THREE.Scene, private col: CollisionWorld, private fx: Effects, private audio: AudioEngine, private blasts: Blasts, private w: RocketWorld) {
    this.mesh = new THREE.InstancedMesh(rocketGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.pool.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, puff: 0, by: null, team: 'omega', hiss: null });
    }
    scene.add(this.mesh);
  }

  /** Fires one from `from` along `dir` (unit). False if the pool is full. */
  fire(from: THREE.Vector3, dir: THREE.Vector3, by: Combatant | null): boolean {
    const r = this.pool.find((x) => !x.active);
    if (!r) return false;
    r.active = true;
    r.pos.copy(from);
    r.vel.copy(dir).multiplyScalar(ROCKET.speed);
    r.life = ROCKET.reach / ROCKET.speed;
    r.puff = 0;
    r.by = by;
    r.team = by?.team ?? 'omega';
    r.hiss = this.audio.rocketHiss(from);
    this.stats.fired++;
    this.audio.rocketLaunch(from);
    // The backblast: a cloud behind the tube.
    for (let i = 0; i < 10; i++)
      this.fx.smoke.spawn({
        x: from.x - dir.x * 0.9, y: from.y - dir.y * 0.9, z: from.z - dir.z * 0.9,
        vx: -dir.x * rand(3, 7) + rand(-1, 1), vy: rand(0, 1), vz: -dir.z * rand(3, 7) + rand(-1, 1),
        r: 0.55, g: 0.53, b: 0.5, a: 0.5, size: 0.35, grow: 1.6, life: rand(0.9, 1.6), drag: 3,
      });
    return true;
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < N; i++) {
      const r = this.pool[i];
      if (!r.active) continue;
      any = true;
      _prev.copy(r.pos);
      r.vel.y -= ROCKET.drop * dt;
      const step = r.vel.length() * dt;
      _d.copy(r.vel).normalize();
      r.life -= dt;
      // What it meets first along this frame's flight: the world, or a body of the other side.
      const wall = this.col.raycast(_prev, _d, step, _hit);
      let best = wall ? wall.dist : step, struck: Combatant | null = null;
      for (const b of this.w.bodies()) {
        if (!b.alive || (r.by && b.team === r.by.team) || b === r.by) continue;
        let t = Infinity;
        if (b.isPlayer) {
          // The player: his body as an upright capsule (feet to head, 0.45 m round).
          _c.set(b.pos.x, b.pos.y + Math.min(b.chestY, Math.max(0.3, _prev.y - b.pos.y)), b.pos.z);
          const along = _c.clone().sub(_prev).dot(_d);
          if (along >= 0 && along <= best && _prev.clone().addScaledVector(_d, along).distanceTo(_c) < 0.45) t = along;
        } else {
          const h = (b as Enemy).raycast(_prev, _d);
          if (h) t = h.dist;
        }
        if (t < best) {
          best = t;
          struck = b;
        }
      }
      if (struck || wall || r.life <= 0) {
        const at = _prev.clone().addScaledVector(_d, best);
        const n = !struck && wall ? wall.normal.clone() : _d.clone().negate();
        if (struck) this.stats.body++;
        else if (wall) this.stats.wall++;
        else this.stats.spent++;
        this.explode(i, at, n);
        continue;
      }
      r.pos.addScaledVector(_d, step);
      r.hiss?.move(r.pos);
      // The motor's flame, and smoke left along the way.
      this.fx.add.spawn({ x: r.pos.x - _d.x * 0.32, y: r.pos.y - _d.y * 0.32, z: r.pos.z - _d.z * 0.32, r: 6, g: 3, b: 1, size: rand(0.12, 0.2), life: 0.05 });
      r.puff += step;
      while (r.puff >= ROCKET.puffEvery) {
        r.puff -= ROCKET.puffEvery;
        const k = r.puff / step;
        this.fx.smoke.spawn({
          x: r.pos.x - _d.x * (0.4 + k * step), y: r.pos.y - _d.y * (0.4 + k * step), z: r.pos.z - _d.z * (0.4 + k * step),
          vx: rand(-0.3, 0.3), vy: rand(0.1, 0.5), vz: rand(-0.3, 0.3),
          r: 0.66, g: 0.64, b: 0.62, a: 0.62, size: 0.22, grow: 1.1, life: rand(1.4, 2.4), drag: 1.5,
        });
      }
      _m.compose(r.pos, _q.setFromUnitVectors(_fwd, _d), _one);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  private explode(i: number, at: THREE.Vector3, normal: THREE.Vector3) {
    const r = this.pool[i];
    r.active = false;
    r.hiss?.stop();
    r.hiss = null;
    this.mesh.setMatrixAt(i, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.blasts.go(at, normal, ROCKET_BLAST, r.by, 'RPG', 1.3);
  }

  /** Every rocket gone (a reset, a level unload: their hiss with them). */
  clear() {
    this.teamLast = {};
    for (let i = 0; i < N; i++) {
      const r = this.pool[i];
      r.active = false;
      r.hiss?.stop();
      r.hiss = null;
      this.mesh.setMatrixAt(i, _zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
