import * as THREE from 'three';
import type { BuildCtx } from './City';
import { propKits, type MercPart } from '../entities/weapons/models';
import { applyWet } from './Ground';
import { applyWear } from './Wear';
import { planarInto } from './StoreSigns';
import { JP_FONT } from './Textures';
import type { Updater } from './PropKit';

/*
  82.0, Night Tokyo's street level (docs/TOKYO_PLAN.md, step 4), from tools/blender/props_street.py:

    signals     at the plaza's two crossings: the vehicle heads on their arms and the pedestrian signals,
                hung from what stands there (a utility pole's side, a building's corner), the street's
                name plate on the arm; their lamps cycle (blue-green, amber, red; the walk signal green
                while the cars wait, blinking out)
    mirrors     convex traffic mirrors on wall brackets at the alleys' blind corners (2.4 m up and more)
    in the road manhole lids, the kerbs' drain grates, yellow tactile strips at the crossings, all of
                them wet (Ground.applyWet) and flush (12-20 mm)

  No collider is added (the mounts are the map's own; the rest is overhead or flush). Without the kit
  the street is as it was.
*/

const PLATES = [['仲見世通り', 'NAKAMISE-DŌRI'], ['線路通り', 'SENRO-DŌRI']] as const;

function plateTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  PLATES.forEach(([jp, en], i) => {
    const y = i * 128;
    g.fillStyle = '#1d4fa8';
    g.fillRect(0, y, 512, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.strokeRect(8, y + 8, 496, 112);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = `bold 52px ${JP_FONT}`;
    g.fillText(jp, 256, y + 64);
    g.font = 'bold 26px sans-serif';
    g.fillText(en, 256, y + 104);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function tactileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6b21c';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 5; i++)
    for (let k = 0; k < 5; k++) {
      const x = 7 + i * 12.5, y = 7 + k * 12.5;
      const grd = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
      grd.addColorStop(0, '#fff2a0');
      grd.addColorStop(1, '#a8860c');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  g.strokeStyle = 'rgba(60,40,0,0.6)';
  g.strokeRect(0.5, 0.5, 63, 63);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The signals' phases (s): cars go, amber, cars stop (the walk signal green, its last 4 s blinking). */
export const SIGNAL_CYCLE = { go: 14, amber: 3, stop: 16, blink: 4 };

/** Which lamps are lit at `t` (s): one of the three heads' lamps, the walk signal's, its blink. */
export function signalAt(t: number) {
  const { go, amber, stop, blink } = SIGNAL_CYCLE;
  const c = ((t % (go + amber + stop)) + go + amber + stop) % (go + amber + stop);
  const car: 'G' | 'Y' | 'R' = c < go ? 'G' : c < go + amber ? 'Y' : 'R';
  let walk: 'G' | 'R' | 'off' = car === 'R' ? 'G' : 'R';
  if (car === 'R' && c > go + amber + stop - blink && Math.floor(c * 2) % 2 === 1) walk = 'off';
  return { car, walk };
}

export class StreetKit {
  private kit: Record<string, readonly MercPart[]> | null;
  private mats: Record<string, THREE.Material>;
  private plate: THREE.Material;
  private lamps: Record<'lampG' | 'lampY' | 'lampR' | 'walkG' | 'walkR', { mat: THREE.MeshBasicMaterial; on: THREE.Color }>;
  /** DEV: what was laid. */
  stats = { signals: 0, walks: 0, mirrors: 0, manholes: 0, grates: 0, tactile: 0 };

  constructor(private ctx: BuildCtx, updaters: Updater[]) {
    const k = propKits();
    this.kit = k && k.sigarm ? (k as Record<string, readonly MercPart[]>) : null;
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.9, ...o });
    const iron = std({ color: 0x3a3a3c, metalness: 0.75, roughness: 0.5 });
    const tactile = std({ map: tactileTexture(), roughness: 0.55 });
    // (Its box UVs a metre a repeat: a block's domes every 0.3 m.)
    tactile.map!.repeat.set(1 / 0.3, 1 / 0.3);
    applyWet(iron, ctx.time, { puddles: false, wet: 0.85 });
    applyWet(tactile, ctx.time, { puddles: false, wet: 0.7 });
    this.mats = {
      galv: applyWear(std({ color: 0x8c9294, metalness: 0.7, roughness: 0.45 }), 'metal'),
      dark: std({ color: 0x111214, roughness: 0.6, metalness: 0.3 }),
      orange: applyWear(std({ color: 0xe0661a, roughness: 0.5 }), 'paint', 0.6),
      mirror: std({ color: 0xd8dce0, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }),
      iron,
      tactile,
    };
    this.plate = std({ map: plateTexture(), roughness: 0.35, emissive: 0x0a1a3a, emissiveIntensity: 0.4 });
    const lamp = (r: number, g: number, b: number) => ({ mat: new THREE.MeshBasicMaterial({ color: 0x000000 }), on: new THREE.Color(r, g, b) });
    this.lamps = { lampG: lamp(0.3, 2.6, 2.0), lampY: lamp(3.0, 1.6, 0.2), lampR: lamp(3.2, 0.25, 0.15), walkG: lamp(0.3, 2.4, 1.4), walkR: lamp(3.0, 0.3, 0.2) };
    const OFF = new THREE.Color(0.04, 0.04, 0.045);
    updaters.push((t) => {
      const s = signalAt(t);
      this.lamps.lampG.mat.color.copy(s.car === 'G' ? this.lamps.lampG.on : OFF);
      this.lamps.lampY.mat.color.copy(s.car === 'Y' ? this.lamps.lampY.on : OFF);
      this.lamps.lampR.mat.color.copy(s.car === 'R' ? this.lamps.lampR.on : OFF);
      this.lamps.walkG.mat.color.copy(s.walk === 'G' ? this.lamps.walkG.on : OFF);
      this.lamps.walkR.mat.color.copy(s.walk === 'R' ? this.lamps.walkR.on : OFF);
    });
  }

  get ready() {
    return !!this.kit;
  }

  private put(node: string, at: THREE.Vector3, ry: number, plate = -1) {
    if (!this.kit) return false;
    const M = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    for (const p of this.kit[node]) {
      if (p.role === 'plate') {
        const g = planarInto(p.geo, [0, 1 - (plate + 1) / PLATES.length, 1, 1 - plate / PLATES.length]);
        this.ctx.builder.addMatrix(g, this.plate, M);
        g.dispose();
        continue;
      }
      const lamp = this.lamps[p.role as keyof StreetKit['lamps']];
      const mat = lamp?.mat ?? this.mats[p.role];
      if (mat) this.ctx.builder.addMatrix(p.geo, mat, M);
    }
    return true;
  }

  /** The vehicle signals' arm from a mount at (x, y, z), out along `ry` (0: +X), the street's plate `plate`. */
  signal(x: number, y: number, z: number, ry: number, plate: number) {
    if (this.put('sigarm', new THREE.Vector3(x, y, z), ry, plate)) this.stats.signals++;
  }

  /** The pedestrian signal on a mount, facing along `ry` (0: +X), its foot `y` up. */
  walk(x: number, y: number, z: number, ry: number) {
    if (this.put('walk', new THREE.Vector3(x, y, z), ry)) this.stats.walks++;
  }

  /** A traffic mirror on a wall: the wall's point and the mirror's facing (0: +Z). */
  mirror(x: number, y: number, z: number, ry: number) {
    if (this.put('mirror', new THREE.Vector3(x, y, z), ry)) this.stats.mirrors++;
  }

  manhole(x: number, z: number, y = 0) {
    if (this.put('manhole', new THREE.Vector3(x, y, z), (x * 3.7 + z) % Math.PI)) this.stats.manholes++;
  }

  /** A drain grate at a kerb, its length along Z (`alongX`: along X). */
  grate(x: number, z: number, alongX = false, y = 0) {
    if (this.put('grate', new THREE.Vector3(x, y, z), alongX ? Math.PI / 2 : 0)) this.stats.grates++;
  }

  /** A tactile strip (1.8 m along X; `alongZ`: along Z). */
  tactile(x: number, z: number, alongZ = false, y = 0.12) {
    if (this.put('tactile', new THREE.Vector3(x, y, z), alongZ ? Math.PI / 2 : 0)) this.stats.tactile++;
  }
}
