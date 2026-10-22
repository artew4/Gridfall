import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TeamId } from '../combat/Team';

/*
  31.0, the deployment zones on the map (code only: primitives and canvases, no files).

  Each zone: a raised platform, a glowing ring in its team's colour with a hex inlay, a thin projector
  beam, and its letter (A, B, C) as a hologram floating over it. Themed per map:

    neon        glossy black pad; a soft glow skirt on the street that sinks into the ground fog
    jungle      a mossy pad, the light gone greenish, vines over its edge (all vines one mesh)
    desert      sandstone; dust swirling round the base (one Points for every pad, moved on the GPU)
    industrial  steel with a hazard-striped rim (a striped canvas round the pad's side)
    glass       a translucent pad, white light, the team's colour in the ring

  Draw calls don't grow with the zones: pads, rims, rings, inlays, beams and skirts are InstancedMeshes
  (one per part and team), the vines one merged mesh, the dust one Points; only the letters are one
  sprite a zone (a sprite per zone: they bob). The idle pulse is a material's opacity (shared per
  team); a spawn's flash is an instance colour (only flashing instances are written). Everything
  built here is disposed with it.
*/

export type ZoneTheme = 'neon' | 'jungle' | 'desert' | 'industrial' | 'glass';

interface ZoneLike {
  id: 'A' | 'B' | 'C';
  team: TeamId;
  centre: THREE.Vector3;
}

const R_PAD = 2.6;
const H_PAD = 0.08;
const TEAM_RGB: Record<TeamId, [number, number, number]> = { alpha: [0.25, 0.85, 1.25], omega: [1.3, 0.5, 0.14] };
const TEAM_CSS: Record<TeamId, string> = { alpha: '#5fe3ff', omega: '#ff8a2a' };

/** The letter, stroked (no fonts), in a hex frame, glowing in the team's colour: 128 x 128. */
function letterCanvas(letter: 'A' | 'B' | 'C', team: TeamId) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = TEAM_CSS[team];
  g.strokeStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // The hex frame.
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const x = 64 + Math.cos(a) * 58, y = 64 + Math.sin(a) * 58;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  // The letter.
  g.lineWidth = 11;
  g.beginPath();
  if (letter === 'A') {
    g.moveTo(38, 100);
    g.lineTo(64, 28);
    g.lineTo(90, 100);
    g.moveTo(48, 76);
    g.lineTo(80, 76);
  } else if (letter === 'B') {
    g.moveTo(44, 28);
    g.lineTo(44, 100);
    g.moveTo(44, 28);
    g.lineTo(68, 28);
    g.arc(68, 46, 18, -Math.PI / 2, Math.PI / 2);
    g.lineTo(44, 64);
    g.moveTo(44, 64);
    g.lineTo(72, 64);
    g.arc(72, 82, 18, -Math.PI / 2, Math.PI / 2);
    g.lineTo(44, 100);
  } else {
    g.arc(66, 64, 34, (40 * Math.PI) / 180, (320 * Math.PI) / 180, true);
  }
  g.stroke();
  return c;
}

/** Diagonal yellow and black hazard stripes (wraps round the pad's side). */
function stripesCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#18181a';
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = '#f2c230';
  for (let x = -16; x < 144; x += 16) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 8, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 8, 0);
    g.closePath();
    g.fill();
  }
  return c;
}

/** A soft round glow, white in the middle, gone at the rim (tinted by the material). */
function glowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const PAD_LOOK: Record<ZoneTheme, { color: number; rough: number; metal: number; opacity?: number }> = {
  neon: { color: 0x0e0e16, rough: 0.25, metal: 0.6 },
  jungle: { color: 0x34442a, rough: 0.9, metal: 0.05 },
  desert: { color: 0x8c7856, rough: 0.95, metal: 0 },
  industrial: { color: 0x3a3c40, rough: 0.55, metal: 0.7 },
  glass: { color: 0xe6f2ff, rough: 0.08, metal: 0.1, opacity: 0.45 },
};

export class SpawnZoneVisual {
  group = new THREE.Group();
  private owned: { dispose(): void }[] = [];
  private rings = new Map<TeamId, THREE.InstancedMesh>();
  private ringMats = new Map<TeamId, THREE.MeshBasicMaterial>();
  private index = new Map<ZoneLike, { team: TeamId; i: number }>();
  private flashT = new Map<ZoneLike, number>();
  private sprites: { s: THREE.Sprite; y: number; phase: number }[] = [];
  private dust: THREE.ShaderMaterial | null = null;
  private base: Record<TeamId, THREE.Color>;

  constructor(zones: readonly ZoneLike[], readonly theme: ZoneTheme) {
    this.group.name = 'spawnZones';
    const own = <T extends { dispose(): void }>(x: T) => (this.owned.push(x), x);
    const jungle = theme === 'jungle', glass = theme === 'glass';
    // The team colours, tinted by the theme (the jungle's light greener; the glass whiter).
    this.base = {
      alpha: new THREE.Color(...TEAM_RGB.alpha).lerp(new THREE.Color(jungle ? 0.45 : 1, jungle ? 1 : 1, jungle ? 0.5 : 1), jungle ? 0.35 : glass ? 0.3 : 0),
      omega: new THREE.Color(...TEAM_RGB.omega).lerp(new THREE.Color(jungle ? 0.7 : 1, jungle ? 0.8 : 1, jungle ? 0.3 : 1), jungle ? 0.3 : glass ? 0.25 : 0),
    };
    const L = PAD_LOOK[theme];
    const padMat = own(new THREE.MeshStandardMaterial({ color: L.color, roughness: L.rough, metalness: L.metal, transparent: L.opacity !== undefined, opacity: L.opacity ?? 1, emissive: glass ? new THREE.Color(0.35, 0.45, 0.55) : new THREE.Color(0, 0, 0), emissiveIntensity: glass ? 0.6 : 0 }));
    const padGeo = own(new THREE.CylinderGeometry(R_PAD, R_PAD + 0.3, H_PAD, 24));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const placed = (mesh: THREE.InstancedMesh, list: readonly ZoneLike[], y: number) => {
      list.forEach((z, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(z.centre.x, z.centre.y + y, z.centre.z), q, one)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    };
    const pads = new THREE.InstancedMesh(padGeo, padMat, zones.length);
    pads.receiveShadow = true;
    placed(pads, zones, H_PAD / 2);
    // Industrial: the hazard stripes round the side.
    if (theme === 'industrial') {
      const tex = own(new THREE.CanvasTexture(stripesCanvas()));
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(10, 1);
      tex.colorSpace = THREE.SRGBColorSpace;
      const band = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(R_PAD + 0.16, R_PAD + 0.31, H_PAD * 0.9, 24, 1, true)), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 })), zones.length);
      placed(band, zones, H_PAD / 2);
    }
    // Per team: the ring, the hex inlay, the beam, the skirt (neon).
    const ringGeo = own(new THREE.RingGeometry(R_PAD - 0.38, R_PAD - 0.12, 48).rotateX(-Math.PI / 2));
    const hexGeo = own(new THREE.CircleGeometry(R_PAD - 0.55, 6).rotateX(-Math.PI / 2));
    const beamGeo = own(new THREE.CylinderGeometry(0.025, 0.07, 2.4, 6, 1, true));
    const glowTex = theme === 'neon' ? own(new THREE.CanvasTexture(glowCanvas())) : null;
    const skirtGeo = glowTex ? own(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2)) : null;
    for (const team of ['alpha', 'omega'] as const) {
      const list = zones.filter((z) => z.team === team);
      if (!list.length) continue;
      list.forEach((z, i) => this.index.set(z, { team, i }));
      const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
      const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8, ...add }));
      this.ringMats.set(team, ringMat);
      const ring = new THREE.InstancedMesh(ringGeo, ringMat, list.length);
      for (let i = 0; i < list.length; i++) ring.setColorAt(i, this.base[team]);
      this.rings.set(team, placed(ring, list, H_PAD + 0.012));
      const inlay = new THREE.InstancedMesh(hexGeo, own(new THREE.MeshBasicMaterial({ color: this.base[team].clone().multiplyScalar(glass ? 0.6 : 0.28), ...add })), list.length);
      placed(inlay, list, H_PAD + 0.008);
      const beam = new THREE.InstancedMesh(beamGeo, own(new THREE.MeshBasicMaterial({ color: this.base[team].clone().multiplyScalar(0.2), side: THREE.DoubleSide, ...add })), list.length);
      placed(beam, list, H_PAD + 1.2);
      if (glowTex && skirtGeo) {
        const skirt = new THREE.InstancedMesh(skirtGeo, own(new THREE.MeshBasicMaterial({ map: glowTex, color: this.base[team].clone().multiplyScalar(0.22), ...add })), list.length);
        placed(skirt, list, 0.04);
      }
      // The letters: one sprite a zone (shared material per letter and team).
      for (const z of list) {
        const tex = own(new THREE.CanvasTexture(letterCanvas(z.id, team)));
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.95 })));
        s.scale.set(1.7, 1.7, 1);
        const y = z.centre.y + H_PAD + 3.1;
        s.position.set(z.centre.x, y, z.centre.z);
        this.group.add(s);
        this.sprites.push({ s, y, phase: z.centre.x * 0.37 + z.centre.z * 0.11 });
      }
    }
    if (jungle) this.vines(zones, own);
    if (theme === 'desert') this.dustFx(zones, own);
  }

  /** Vines over each pad's edge: chains of thin bent cylinders, all merged into one mesh. */
  private vines(zones: readonly ZoneLike[], own: <T extends { dispose(): void }>(x: T) => T) {
    const parts: THREE.BufferGeometry[] = [];
    const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const z of zones) {
      for (let k = 0; k < 7; k++) {
        const a = rnd() * Math.PI * 2;
        // From the pad's top, out over the rim, down to the ground: three segments.
        const pts = [
          new THREE.Vector3(Math.cos(a) * (R_PAD - 0.9 - rnd()), H_PAD + 0.03, Math.sin(a) * (R_PAD - 0.9 - rnd())),
          new THREE.Vector3(Math.cos(a) * (R_PAD + 0.1), H_PAD + 0.06, Math.sin(a) * (R_PAD + 0.1)),
          new THREE.Vector3(Math.cos(a) * (R_PAD + 0.5), 0.05, Math.sin(a) * (R_PAD + 0.5)),
          new THREE.Vector3(Math.cos(a + 0.2) * (R_PAD + 1.1 + rnd()), 0.02, Math.sin(a + 0.2) * (R_PAD + 1.1 + rnd())),
        ];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i + 1];
          const len = p0.distanceTo(p1);
          const g = new THREE.CylinderGeometry(0.045, 0.06, len, 5, 1, true);
          v.subVectors(p1, p0).normalize();
          q.setFromUnitVectors(up, v);
          m.compose(new THREE.Vector3((p0.x + p1.x) / 2 + z.centre.x, (p0.y + p1.y) / 2 + z.centre.y, (p0.z + p1.z) / 2 + z.centre.z), q, new THREE.Vector3(1, 1, 1));
          g.applyMatrix4(m);
          parts.push(g);
        }
      }
    }
    const merged = own(mergeGeometries(parts)!);
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, own(new THREE.MeshStandardMaterial({ color: 0x2f5a22, roughness: 0.85, emissive: new THREE.Color(0.02, 0.08, 0.02) })));
    this.group.add(mesh);
  }

  /** Dust round each pad's base: 40 motes a pad, one Points for all, orbiting and rising on the GPU. */
  private dustFx(zones: readonly ZoneLike[], own: <T extends { dispose(): void }>(x: T) => T) {
    const N = 40;
    const pos = new Float32Array(zones.length * N * 3), seed = new Float32Array(zones.length * N);
    zones.forEach((z, j) =>
      Array.from({ length: N }, (_, i) => {
        const k = j * N + i;
        pos.set([z.centre.x, z.centre.y, z.centre.z], k * 3);
        seed[k] = Math.random();
      }),
    );
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.dust = own(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float seed; uniform float uTime; varying float vA;
          void main() {
            float t = fract(uTime * (0.08 + 0.06 * seed) + seed);
            float a = seed * 40.0 + uTime * (0.4 + 0.5 * seed);
            float r = 2.2 + 1.6 * fract(seed * 7.13) + t * 0.8;
            vec3 p = position + vec3(cos(a) * r, 0.15 + t * 1.6, sin(a) * r);
            vA = sin(t * 3.14159) * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.0 + 3.0 * fract(seed * 3.7)) * (60.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.86, 0.74, 0.55, vA * (1.0 - d * 2.0)); }`,
      }),
    );
    this.group.add(new THREE.Points(g, this.dust));
  }

  /** Someone spawned in this zone: its ring flares white-hot in the team's colour for a moment. */
  flash(z: ZoneLike) {
    if (this.index.has(z)) this.flashT.set(z, 1.2);
  }

  /** Each frame: the rings' pulse (two opacities), the letters' bob, the flashes, the dust's clock. */
  update(dt: number, time: number) {
    for (const [team, mat] of this.ringMats) mat.opacity = 0.62 + 0.22 * Math.sin(time * 2.2 + (team === 'alpha' ? 0 : 1.6));
    for (const sp of this.sprites) sp.s.position.y = sp.y + Math.sin(time * 1.4 + sp.phase) * 0.14;
    for (const [z, t] of this.flashT) {
      const left = Math.max(0, t - dt);
      const { team, i } = this.index.get(z)!;
      const k = left / 1.2;
      _c.copy(this.base[team]).multiplyScalar(1 + 1.8 * k * k);
      const ring = this.rings.get(team)!;
      ring.setColorAt(i, _c);
      ring.instanceColor!.needsUpdate = true;
      if (left <= 0) this.flashT.delete(z);
      else this.flashT.set(z, left);
    }
    if (this.dust) this.dust.uniforms.uTime.value = time;
  }

  dispose() {
    this.group.removeFromParent();
    for (const o of this.group.children) if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.sprites.length = 0;
  }
}
const _c = new THREE.Color();
