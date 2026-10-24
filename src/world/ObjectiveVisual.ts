import * as THREE from 'three';
import type { TeamId } from '../combat/Team';

/*
  51.0, the flank objectives in the world (Objectives.ts): over each point a beacon, a tall beam of
  light in its holder's colour (white: nobody's) seen across the map, and a ring on the ground its
  radius round; while a team takes it both pulse in that team's colour. Additive, unlit, no shadows,
  one draw call each.
*/

const COLOR: Record<TeamId | 'none', THREE.Color> = {
  alpha: new THREE.Color(0.35, 0.95, 1.7),
  omega: new THREE.Color(1.8, 0.62, 0.2),
  none: new THREE.Color(1.3, 1.3, 1.25),
};

export class ObjectiveVisual {
  group = new THREE.Group();
  private items: { beam: THREE.Mesh; ring: THREE.Mesh; core: THREE.Mesh; beamMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial; coreMat: THREE.MeshBasicMaterial }[] = [];
  private owned: { dispose(): void }[] = [];

  /** `beamFrom`: each beam's foot (over the roofs above an indoor point: no pillar of light in a room). */
  constructor(points: readonly { pos: THREE.Vector3; r: number }[], beamFrom: readonly number[] = []) {
    this.group.name = 'objectives';
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.7, 60, 12, 1, true);
    beamGeo.translate(0, 30, 0);
    const coreGeo = new THREE.CylinderGeometry(0.08, 0.08, 60, 6, 1, true);
    coreGeo.translate(0, 30, 0);
    this.owned.push(beamGeo, coreGeo);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide } as const;
    for (const p of points) {
      const ringGeo = new THREE.RingGeometry(p.r - 0.35, p.r, 64).rotateX(-Math.PI / 2);
      this.owned.push(ringGeo);
      const beamMat = new THREE.MeshBasicMaterial({ color: COLOR.none.clone().multiplyScalar(0.18), ...add });
      const coreMat = new THREE.MeshBasicMaterial({ color: COLOR.none.clone().multiplyScalar(0.8), ...add });
      const ringMat = new THREE.MeshBasicMaterial({ color: COLOR.none.clone().multiplyScalar(0.5), ...add });
      this.owned.push(beamMat, coreMat, ringMat);
      const beam = new THREE.Mesh(beamGeo, beamMat), core = new THREE.Mesh(coreGeo, coreMat), ring = new THREE.Mesh(ringGeo, ringMat);
      for (const m of [beam, core]) m.position.set(p.pos.x, beamFrom[this.items.length] ?? p.pos.y, p.pos.z);
      ring.position.set(p.pos.x, p.pos.y + 0.08, p.pos.z);
      for (const m of [beam, core, ring]) {
        m.frustumCulled = false;
        m.renderOrder = 5;
        this.group.add(m);
      }
      this.items.push({ beam, ring, core, beamMat, ringMat, coreMat });
    }
  }

  /** Each frame: every point's holder, who is taking it (or null), the clock. */
  update(states: readonly { owner: TeamId | null; capturing: TeamId | null }[], time: number) {
    this.items.forEach((it, k) => {
      const s = states[k];
      if (!s) return;
      const base = COLOR[s.owner ?? 'none'];
      const pulse = s.capturing ? 0.5 + 0.5 * Math.sin(time * 7) : 0;
      const take = s.capturing ? COLOR[s.capturing] : base;
      it.beamMat.color.copy(base).lerp(take, pulse).multiplyScalar(0.08 + 0.08 * pulse);
      it.coreMat.color.copy(base).lerp(take, pulse).multiplyScalar(0.45 + 0.4 * pulse);
      it.ringMat.color.copy(base).lerp(take, pulse).multiplyScalar(0.45 + 0.5 * pulse);
    });
  }

  dispose() {
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.items.length = 0;
  }
}
