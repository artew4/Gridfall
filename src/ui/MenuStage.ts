import * as THREE from 'three';
import { ARMORY, type WeaponId } from '../entities/weapons/armory';
import type { LevelLook } from '../levels/Level';
import { crateTexture } from '../levels/desert/textures';
import { makeAmmoDisplay } from '../world/Textures';
import { disposeScene } from '../core/dispose';
import { gunMats } from '../entities/weapons/theme';

/*
  16.0, the main menu's live background (the brief's option B): the loadout's weapon turning slowly
  on a crate under a spotlight, on a wet floor in the dark, with cyan and magenta rim lights, a light
  cone with dust in it, and far neon through the haze. The maps screen shows the picked map itself
  (the level's own title camera), so the stage only exists on the root and controls screens.

  It is a whole scene of its own (the renderer draws it in place of the level's) and it is
  disposable: `dispose` frees every geometry, material, texture and render target it made, and the
  Game drops its only reference. It is built when the menu's root opens and destroyed before a map
  is shown or a match loads (Game.syncStage); a forced-GC check in scripts/stagecheck.mjs proves the
  objects are collected, not just freed on the GPU.

  Nothing here is per-frame allocation: the dust drifts in its vertex shader, the camera reuses
  vectors.
*/

/**
 * 17.0: the stage's resolution (CSS pixel multiple, under the preset's). It is fill-bound and sits
 * behind the menu's HTML: 1.0 costs 3.3 ms of GPU a frame against 5.1 at Balanced's 1.25.
 */
export const STAGE_PIXEL_RATIO = 1;

/** Where the weapon turns (world), and its stand height over the crate. */
const SHOW = new THREE.Vector3(0, 0.8, 0);

export const STAGE_LOOK: LevelLook = {
  exposure: 1.0,
  bloom: { strength: 0.95, radius: 0.6, threshold: 0.82 },
  shadows: false,
  shadowTint: [0.0, 0.0, 0.012],
  grade: { split: 1, teal: [0.0, 0.012, 0.022], warm: [1.04, 1.0, 1.02], sat: 1.08, shadow: [0.85, 0.9, 1.1], lo: 0.06, hi: [0.2, 1.4], desat: 0.05, crush: 0.2, contrast: 0.12 },
};

export class MenuStage {
  readonly scene = new THREE.Scene();
  readonly look = STAGE_LOOK;
  private env: THREE.WebGLRenderTarget;
  private turntable = new THREE.Group();
  private gun = new THREE.Group();
  private display = makeAmmoDisplay();
  private dust: THREE.Points;
  private halo: THREE.Mesh;
  private time = { value: 0 };
  private spin = 0;
  private swapT = 1;
  private _dir = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _at = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  weapon: WeaponId;

  constructor(renderer: THREE.WebGLRenderer, weapon: WeaponId) {
    const s = this.scene;
    s.name = 'menu-stage';
    s.background = new THREE.Color('#04050a');
    s.fog = new THREE.FogExp2('#06070e', 0.075);

    // Reflections: a tiny studio of neon strips, prefiltered once.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = new THREE.Scene();
    studio.background = new THREE.Color('#020308');
    const strip = (color: string, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 1, 0);
      studio.add(m);
    };
    strip('#19e6ff', -4, 2, -2, 0.5, 4);
    strip('#ff2fd0', 4, 2, -1, 0.5, 4);
    strip('#ffffff', 0, 6, 0, 4, 4);
    strip('#9fb8ff', 3, 2, 4, 2, 3);
    strip('#ffb000', 0, 1, 5, 4, 0.3);
    this.env = pmrem.fromScene(studio, 0.03);
    disposeScene(studio, studio);
    pmrem.dispose();
    s.environment = this.env.texture;
    s.environmentIntensity = 1.1;

    // Wet floor: dark, glossy, a faint grid.
    const grid = gridTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.22, metalness: 0.65, emissive: 0x19e6ff, emissiveMap: grid, emissiveIntensity: 0.35 }),
    );
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000 }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.003;
    s.add(contact);

    // The crate and the turntable on it.
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.72, 0.85),
      new THREE.MeshStandardMaterial({ map: crateTexture('GRIDFALL', 'ARMORY · 7', '#2a2f3a', '#c9d2dc'), roughness: 0.7, metalness: 0.15 }),
    );
    crate.position.y = 0.36;
    s.add(crate);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.035, 40), new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.55, metalness: 0.7 }));
    plate.position.y = 0.738;
    s.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.006, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.95, 1.25) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.757;
    s.add(ring);
    this.turntable.position.copy(SHOW);
    this.turntable.add(this.gun);
    s.add(this.turntable);

    // Light: the key spot from above, the volumetric cone that shows it, two coloured rims.
    const spot = new THREE.SpotLight(0xfff1dc, 48, 9, 0.36, 0.55, 2);
    spot.position.set(0.25, 4.6, 0.35);
    spot.target.position.set(0, 0.8, 0);
    s.add(spot, spot.target);
    s.add(lightCone(spot.position, spot.target.position, spot.angle * 0.92));
    const rimC = new THREE.PointLight(0x19e6ff, 7, 7, 2);
    rimC.position.set(-1.6, 1.5, -1.2);
    const rimM = new THREE.PointLight(0xff2fd0, 6, 7, 2);
    rimM.position.set(1.7, 1.3, -1.0);
    // A cool fill from the camera's side so the gun's dark metal reads between the rims.
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.9);
    fill.position.set(2, 1.6, 3);
    s.add(rimC, rimM, fill, new THREE.HemisphereLight(0x1a2236, 0x05060a, 0.35));

    // Far neon through the haze (bloom does the glow).
    const bars: [string, number, number, number, number][] = [
      ['#19e6ff', -7, -9, 0.12, 5.5], ['#ff2fd0', -3.5, -12, 0.1, 7], ['#ffb000', 2.5, -10, 0.12, 3.2],
      ['#19e6ff', 6.5, -11, 0.1, 6.2], ['#ff2fd0', 9, -7, 0.14, 4], ['#7f5cff', -10, -6, 0.12, 4.6],
    ];
    for (const [c, x, z, w, h] of bars) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) }));
      b.position.set(x, h / 2 + 0.2, z);
      s.add(b);
    }

    // A soft glow behind the gun (it turns to face the camera) so a black receiver has a silhouette.
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.6),
      new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    s.add(this.halo);

    this.dust = dustMotes(this.time, spot.position, spot.target.position);
    s.add(this.dust);

    this.weapon = weapon;
    this.buildWeapon(weapon);
  }

  /** Show another gun (the armory row): the old model is freed at once. */
  setWeapon(id: WeaponId) {
    if (id === this.weapon) return;
    this.weapon = id;
    this.buildWeapon(id);
    this.swapT = 0;
  }

  private buildWeapon(id: WeaponId) {
    disposeScene(this.gun);
    this.gun.clear();
    const spec = ARMORY[id].spec;
    const slide = new THREE.Group(), mag = new THREE.Group();
    // 21.0: the menu shows the blaster finish (the guns' home look); in a match they wear the map's.
    spec.build({ gun: this.gun, slide, mag, display: this.display.texture, mats: gunMats('blaster') });
    this.display.draw(spec.mag, spec.mag, false);
    // A viewmodel comes with gloved hands on it: not on the crate.
    this.gun.traverse((o) => {
      if (o.userData.hands) o.visible = false;
    });
    // Centre it on the turntable at a showroom size (measured off the turntable, without the hidden
    // hands).
    this.turntable.remove(this.gun);
    this.gun.scale.setScalar(1);
    this.gun.position.set(0, 0, 0);
    this.gun.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.gun.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
    });
    const size = box.getSize(this._dir), c = box.getCenter(this._at);
    // Up to 1.8× life size: a rifle fills the plate, the pistol stays a pistol.
    const k = Math.min(1.8, 0.95 / Math.max(size.x, size.y, size.z));
    this.gun.scale.setScalar(k);
    // Centred over the plate, hovering just above it.
    this.gun.position.set(-c.x * k, -box.min.y * k + 0.025, -c.z * k);
    this.turntable.add(this.gun);
  }

  /** One frame: the turntable, the dust, and the camera's slow drift (the weapon framed right of centre). */
  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.time.value += dt;
    const t = this.time.value;
    this.spin += dt * 0.42;
    this.swapT = Math.min(1, this.swapT + dt * 2.5);
    const pop = 1 - Math.pow(1 - this.swapT, 3);
    this.turntable.rotation.y = this.spin;
    this.turntable.position.y = SHOW.y + Math.sin(t * 0.9) * 0.015;
    this.turntable.scale.setScalar(0.6 + 0.4 * pop);

    const a = 0.55 + Math.sin(t * 0.06) * 0.35;
    const r = 1.65 + Math.sin(t * 0.11) * 0.1;
    cam.position.set(Math.sin(a) * r, 1.12 + Math.sin(t * 0.13) * 0.05, Math.cos(a) * r);
    // Look a little to the left of the gun so it sits right of centre (the menu has the left).
    const dir = this._dir.copy(SHOW).sub(cam.position).normalize();
    const right = this._right.crossVectors(dir, MenuStage.UP).normalize();
    const off = cam.aspect > 1.25 ? 0.36 : 0;
    // The halo sits behind the gun on the line from the camera.
    this.halo.position.copy(SHOW).addScaledVector(dir, 1.4).setY(SHOW.y + 0.25);
    this.halo.lookAt(cam.position);
    cam.lookAt(this._at.copy(SHOW).addScaledVector(right, -off).setY(SHOW.y + 0.16));
  }

  /** Frees everything the stage made (GPU side); the caller drops the stage itself. */
  dispose() {
    const freed = disposeScene(this.scene, this.scene);
    this.display.texture.dispose();
    this.env.dispose();
    this.scene.clear();
    return freed;
  }
}

/** A faint cyan grid for the floor's emissive map (lines fade between, the floor stays black). */
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  for (let i = 64; i < 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.anisotropy = 4;
  return t;
}

/** A wide soft violet-blue glow (kept under the bloom threshold: a backdrop, not a light). */
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 80, 4, 128, 80, 120);
  gr.addColorStop(0, 'rgba(70, 90, 170, 0.55)');
  gr.addColorStop(0.5, 'rgba(60, 40, 120, 0.22)');
  gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft dark blob under the crate (the stage has no shadow map). */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** The spot's light made visible: an open cone, brightest at the lamp, fading at its edges and down. */
function lightCone(from: THREE.Vector3, to: THREE.Vector3, angle: number) {
  const h = from.distanceTo(to) + 0.4;
  const geo = new THREE.CylinderGeometry(0.02, Math.tan(angle) * h, h, 48, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: h }, uColor: { value: new THREE.Color(1.0, 0.92, 0.8) } },
    vertexShader: /* glsl */ `
      varying float vDown; varying vec3 vN; varying vec3 vView;
      uniform float uH;
      void main() {
        vDown = -position.y / uH;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vDown; varying vec3 vN; varying vec3 vView;
      uniform vec3 uColor;
      void main() {
        float edge = pow(abs(dot(vN, vView)), 1.6);
        float a = edge * (1.0 - vDown) * (1.0 - vDown) * 0.16;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.lookAt(to);
  m.rotateX(-Math.PI / 2);
  return m;
}

/** Dust in the cone: positions fixed on the GPU, drift and twinkle in the vertex shader. */
function dustMotes(time: { value: number }, from: THREE.Vector3, to: THREE.Vector3) {
  const N = 260;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  let x = 1234567;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const k = rnd();
    const y = to.y + k * (from.y - to.y - 0.4);
    const rad = (1 - k) * 0.95 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
    pos.set([to.x + Math.cos(a) * rad, y, to.z + Math.sin(a) * rad], i * 3);
    seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.05 + seed * 0.08) + seed * 40.0;
        p.x += sin(t * 1.7) * 0.12; p.z += cos(t * 1.3) * 0.12; p.y += sin(t) * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.35 + 0.65 * abs(sin(t * 3.0 + seed * 9.0))) * 0.75;
        gl_PointSize = (1.4 + seed * 2.2) * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * smoothstep(0.5, 0.0, d) * vA, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
