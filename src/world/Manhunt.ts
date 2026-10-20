import * as THREE from 'three';
import type { CollisionWorld } from './Collision';
import { wantedTexture } from './Textures';

/** Street spots and the direction of the wall to put a poster on. */
const POSTERS: [number, number, number, number, number][] = [
  [-9, 1.7, 25.5, 0, 1], // back alley, by the start
  [-17, 1.7, 25.5, 0, -1],
  [0, 1.7, 30, -1, 0], // Lantern Street
  [0, 1.7, 37, 1, 0],
  [-3, 1.7, -12.5, 0, -1], // plaza, under the walkway
  [26, 1.7, -0.5, 0, 1], // Neon Alley
  [0, -4.3, 18.5, 0, -1], // station concourse
];

/**
 * The manhunt in the city itself: Kurogane's wanted notice takes over the rooftop billboard every
 * few seconds, and the same notice is pasted on walls along the way.
 */
export class Manhunt {
  readonly tex = wantedTexture();
  private board: THREE.MeshBasicMaterial | null = null;
  private ads: THREE.Texture | null = null;
  private posters = new THREE.Group();
  private t = 0;
  /** Forced on (the opening shot) or cycling (gameplay); off in arcade. */
  mode: 'off' | 'cycle' | 'on' = 'off';

  constructor(scene: THREE.Scene, col: CollisionWorld, billboard: THREE.Texture) {
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && (m as THREE.MeshBasicMaterial).map === billboard) this.board = m;
    });
    this.ads = billboard;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(0.75, 0.75, 0.75) });
    const geo = new THREE.PlaneGeometry(0.75, 2.32);
    const dir = new THREE.Vector3();
    for (const [x, y, z, dx, dz] of POSTERS) {
      const from = new THREE.Vector3(x, y, z);
      dir.set(dx, 0, dz);
      const hit = col.raycast(from, dir, 6);
      if (!hit || Math.abs(hit.normal.y) > 0.1) continue;
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(hit.point).addScaledVector(hit.normal, 0.03);
      p.lookAt(p.position.clone().add(hit.normal));
      this.posters.add(p);
    }
    this.posters.visible = false;
    scene.add(this.posters);
  }

  get posterCount() {
    return this.posters.children.length;
  }

  setMode(m: 'off' | 'cycle' | 'on') {
    this.mode = m;
    this.posters.visible = m !== 'off';
    // Cycling starts on the ads.
    this.t = 9;
    this.apply(m === 'on');
  }

  private apply(wanted: boolean) {
    if (!this.board) return;
    const map = wanted ? this.tex : this.ads;
    if (this.board.map !== map) {
      this.board.map = map;
      this.board.needsUpdate = true;
    }
  }

  update(dt: number) {
    if (this.mode !== 'cycle') return;
    // 9 s of the wanted notice, 7 s of ads.
    this.t = (this.t + dt) % 16;
    this.apply(this.t < 9);
  }
}
