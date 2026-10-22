import * as THREE from 'three';
import type { TeamId } from '../combat/Team';

/*
  27.0, the spawn pads on the floor: a hexagonal ring with six chevrons pointing in and a small hex at
  the centre, flat, a few cm up (polygon offset against the floor). Every pad of a map is one instance
  of one InstancedMesh: one draw call however many pads, 96 triangles each. The parts are told apart
  by vertex colour (the ring brightest), and the instance colour tints the whole pad: a quiet neutral,
  and a flash in the team's colour for FLASH s when someone spawns on it (only the flashing instances
  are written, and only while they flash).
*/

const R_OUT = 1.6, R_IN = 1.38;
const FLASH = 1.4;
const NEUTRAL = new THREE.Color(0.42, 0.62, 0.7);
const TEAM: Record<TeamId, THREE.Color> = { alpha: new THREE.Color(0.25, 0.95, 1.6), omega: new THREE.Color(1.7, 0.62, 0.18) };

/** The pad's geometry, flat on y = 0, its forward (the spawner's facing) +z. */
export function padGeometry() {
  const pos: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], k: number) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(k, k, k);
  };
  const at = (r: number, a: number) => [Math.sin(a) * r, 0, Math.cos(a) * r];
  // The ring: 6 quads between the hexagons.
  for (let i = 0; i < 6; i++) {
    const a0 = (i * Math.PI) / 3, a1 = ((i + 1) * Math.PI) / 3;
    tri(at(R_IN, a0), at(R_OUT, a0), at(R_OUT, a1), 1);
    tri(at(R_IN, a0), at(R_OUT, a1), at(R_IN, a1), 1);
  }
  // Six chevrons pointing at the centre (one quad per arm: two arms each).
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const tip = at(0.62, a), l = at(1.02, a - 0.28), r = at(1.02, a + 0.28);
    const tipO = at(0.8, a), lO = at(1.12, a - 0.2), rO = at(1.12, a + 0.2);
    // The front chevron (pointing back at the centre from +z) a touch brighter: the way to face.
    const k = i === 0 || i === 5 ? 0.75 : 0.5;
    tri(tip, l, lO, k);
    tri(tip, lO, tipO, k);
    tri(tip, tipO, rO, k);
    tri(tip, rO, r, k);
  }
  // The centre hex.
  for (let i = 0; i < 6; i++) tri([0, 0, 0], at(0.36, (i * Math.PI) / 3), at(0.36, ((i + 1) * Math.PI) / 3), 0.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class SpawnPads {
  mesh: THREE.InstancedMesh;
  private flashT: number[];
  private flashC: (THREE.Color | null)[];
  private flashing = 0;

  constructor(pads: readonly { pos: THREE.Vector3; yaw: number }[]) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(padGeometry(), mat, pads.length);
    this.mesh.name = 'spawnPads';
    // Flat on the floor: no shadows to cast, none worth receiving.
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    pads.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      m.compose(new THREE.Vector3(p.pos.x, p.pos.y + 0.03, p.pos.z), q, one);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, NEUTRAL);
    });
    this.mesh.computeBoundingSphere();
    this.flashT = pads.map(() => 0);
    this.flashC = pads.map(() => null);
  }

  /** Someone of `team` spawned on pad `i`: it flashes in the team's colour. */
  flash(i: number, team: TeamId) {
    if (!this.flashT[i]) this.flashing++;
    this.flashT[i] = FLASH;
    this.flashC[i] = TEAM[team];
  }

  update(dt: number) {
    if (!this.flashing) return;
    for (let i = 0; i < this.flashT.length; i++) {
      if (!this.flashT[i]) continue;
      this.flashT[i] = Math.max(0, this.flashT[i] - dt);
      const k = this.flashT[i] / FLASH;
      _c.copy(NEUTRAL).lerp(this.flashC[i]!, k * k);
      this.mesh.setColorAt(i, _c);
      if (!this.flashT[i]) this.flashing--;
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
const _c = new THREE.Color();
