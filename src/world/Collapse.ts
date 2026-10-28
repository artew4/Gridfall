import * as THREE from 'three';
import type { Collider, CollisionWorld } from './Collision';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { breachDamage, type BreachSpec } from './Destruction';

/*
  93.0, the big set pieces (docs/DESTRUCTION_PLAN.md, step 4): Old Port's shipwright scaffold towers.
  A tower is a steel frame round staging boards, drawn on its own (not merged: it moves). Blasts wear
  it down (a rocket against it at once, a few frags beside it); then it goes over: it tips about the
  foot of its far side, away from the blast, slowly and then fast (a fall under gravity), its boards
  flying off as it goes; on the ground it is gone, and what it was lies along where it fell (rubble:
  a low wreck of steel and boards to vault or hide behind). Its collider leaves the moment it starts to
  fall. An authored animation, not physics: it never stops on something or lands on anyone.
*/

export const TOWER = { hp: 260, fall: 1.25, maxTilt: Math.PI / 2 - 0.08 };

interface Tower {
  min: THREE.Vector3;
  max: THREE.Vector3;
  group: THREE.Group;
  pivot: THREE.Group;
  col: Collider;
  hp: number;
  /** Falling: seconds since it began; its axis and direction (unit, flat); done. */
  t: number;
  dir: THREE.Vector3;
  axis: THREE.Vector3;
  state: 'up' | 'falling' | 'down';
  boardsShed: number;
}

export interface CollapseHooks {
  /** It began to fall (where, the way). */
  falling(at: THREE.Vector3, dir: THREE.Vector3): void;
  /** A board came off at `p`, thrown at `vel`. */
  shed(p: THREE.Vector3, vel: THREE.Vector3): void;
  /** It hit the ground: what it was, laid along `from` → `to` (its foot to where its top came down), on `floor`. */
  landed(from: THREE.Vector3, to: THREE.Vector3, width: number, height: number): void;
  changed(): void;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Collapse {
  readonly towers: Tower[] = [];
  /** DEV: towers down. */
  stats = { fallen: 0 };

  constructor(private scene: THREE.Scene, private col: CollisionWorld, private hooks: CollapseHooks) {}

  /** A tower over the box (`frame`: the steel's material, `boards`: the staging's), its collider added now. */
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, frame: THREE.Material, boards: THREE.Material): Collider {
    const min = new THREE.Vector3(x0, y0, z0), max = new THREE.Vector3(x1, y1, z1);
    const col = this.col.add(x0, y0, z0, x1, y1, z1, 'metal');
    const group = new THREE.Group();
    const pivot = new THREE.Group();
    group.add(pivot);
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    // One mesh for the frame, one for the boards (two draws a tower).
    const steel: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
    const box = (list: THREE.BufferGeometry[], sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      list.push(g);
    };
    // The frame: four standards, ledgers every 1.5 m, a brace across each long face; the boards inside.
    const t = 0.07;
    let levels = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(steel, t, h, t, (sx * (w - t)) / 2, h / 2, (sz * (d - t)) / 2);
    for (let y = 0.15; y < h; y += 1.5) {
      for (const sz of [-1, 1]) box(steel, w, t * 0.8, t * 0.8, 0, y, (sz * (d - t)) / 2);
      for (const sx of [-1, 1]) box(steel, t * 0.8, t * 0.8, d, (sx * (w - t)) / 2, y, 0);
      box(wood, w - 0.1, 0.06, d - 0.1, 0, y + 0.08, 0);
      levels++;
    }
    const lift = Math.min(h, 3);
    for (const sz of [-1, 1]) box(steel, t * 0.7, Math.hypot(w, lift), t * 0.7, 0, lift / 2 + 0.2, (sz * (d - t)) / 2, -Math.atan2(w, lift));
    for (const [list, m, boardsMesh] of [[steel, frame, false], [wood, boards, true]] as const) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
      list.forEach((g) => g.dispose());
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.board = boardsMesh;
      mesh.userData.levels = levels;
      pivot.add(mesh);
    }
    // The frame's middle at its foot's middle (the pivot moves to an edge when it falls).
    group.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    this.scene.add(group);
    this.towers.push({ min, max, group, pivot, col, hp: TOWER.hp, t: 0, dir: new THREE.Vector3(), axis: new THREE.Vector3(), state: 'up', boardsShed: 0 });
    return col;
  }

  /** A blast at `at`: every standing tower in its reach worn down; one at none goes over, away from it. */
  blast(at: THREE.Vector3, s: BreachSpec) {
    for (const tw of this.towers) {
      if (tw.state !== 'up') continue;
      _p.set(THREE.MathUtils.clamp(at.x, tw.min.x, tw.max.x), THREE.MathUtils.clamp(at.y, tw.min.y, tw.max.y), THREE.MathUtils.clamp(at.z, tw.min.z, tw.max.z));
      const dm = breachDamage(_p.distanceTo(at), s);
      if (dm <= 0) continue;
      tw.hp -= dm;
      if (tw.hp <= 0) this.fell(tw, at);
    }
  }

  /** It goes over, away from `from`, about its far foot. */
  private fell(tw: Tower, from: THREE.Vector3) {
    tw.state = 'falling';
    tw.t = 0;
    this.stats.fallen++;
    const cx = (tw.min.x + tw.max.x) / 2, cz = (tw.min.z + tw.max.z) / 2;
    const dir = tw.dir.set(cx - from.x, 0, cz - from.z);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    // Along its narrower side's axis (a frame folds the way it is weakest), signed away from the blast.
    const w = tw.max.x - tw.min.x, d = tw.max.z - tw.min.z;
    if (w < d) dir.set(Math.sign(dir.x) || 1, 0, 0);
    else dir.set(0, 0, Math.sign(dir.z) || 1);
    tw.axis.set(dir.z, 0, -dir.x);
    // The pivot to the foot of the side it falls to.
    const half = (dir.x !== 0 ? w : d) / 2;
    tw.group.position.addScaledVector(dir, half);
    tw.pivot.position.addScaledVector(dir, -half);
    this.col.remove(tw.col);
    this.hooks.falling(new THREE.Vector3(cx, tw.min.y, cz), dir.clone());
    this.hooks.changed();
  }

  update(dt: number) {
    for (const tw of this.towers) {
      if (tw.state !== 'falling') continue;
      tw.t += dt;
      const k = Math.min(1, tw.t / TOWER.fall);
      // Slow off its foot, then fast: an angle under gravity (k²).
      const a = TOWER.maxTilt * k * k;
      tw.group.quaternion.setFromAxisAngle(tw.axis, -a);
      // The boards come off a third of the way down, flung on along the fall.
      const boards = tw.pivot.children.find((c) => c.userData.board)!;
      if (boards.visible && k > 0.35) {
        boards.visible = false;
        const n = boards.userData.levels as number;
        const h = tw.max.y - tw.min.y;
        for (let i = 0; i < n * 2; i++) {
          // Up the tilted frame: a point at its height `y` along it.
          const y = (0.15 + 1.5 * Math.floor(i / 2)) / h;
          tw.pivot.localToWorld(_p.set((Math.random() - 0.5) * 0.6, y * h, (Math.random() - 0.5) * 0.6));
          this.hooks.shed(_p.clone(), _q.copy(tw.dir).multiplyScalar(2 + Math.random() * 4).setY(1 + Math.random() * 2).clone());
        }
        tw.boardsShed = n;
      }
      if (k >= 1) {
        tw.state = 'down';
        tw.group.visible = false;
        const foot = tw.group.position.clone();
        const h = tw.max.y - tw.min.y;
        const span = (tw.dir.x !== 0 ? tw.max.z - tw.min.z : tw.max.x - tw.min.x);
        this.hooks.landed(foot, foot.clone().addScaledVector(tw.dir, h * 0.95), span, Math.min(tw.max.x - tw.min.x, tw.max.z - tw.min.z));
        this.hooks.changed();
      }
    }
  }

  /** Every tower standing again (a new match). */
  reset() {
    for (const tw of this.towers) {
      if (tw.state === 'up') continue;
      tw.state = 'up';
      tw.hp = TOWER.hp;
      tw.group.visible = true;
      tw.group.quaternion.identity();
      tw.group.position.set((tw.min.x + tw.max.x) / 2, tw.min.y, (tw.min.z + tw.max.z) / 2);
      tw.pivot.position.set(0, 0, 0);
      for (const c of tw.pivot.children) c.visible = true;
      tw.boardsShed = 0;
      tw.col = this.col.add(tw.min.x, tw.min.y, tw.min.z, tw.max.x, tw.max.y, tw.max.z, 'metal');
    }
    this.stats.fallen = 0;
  }
}
