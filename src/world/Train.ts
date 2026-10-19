import * as THREE from 'three';
import type { Glows, Glow } from './Glows';
import { RAIL } from './City';
import { clamp, mulberry32, rand } from '../core/math';

const CARS = 8;
const CAR_L = 19;
const PITCH = 19.6;
const CAR_Y = 9.15;
const SPEED = 24;

/** Window strip texture with passengers: albedo and emissive share the layout. */
function carTextures(seed: number) {
  const rnd = mulberry32(seed);
  const W = 1024;
  const H = 128;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return { c, g: c.getContext('2d')! };
  };
  const a = make();
  const e = make();
  a.g.fillStyle = '#a7adb5';
  a.g.fillRect(0, 0, W, H);
  a.g.fillStyle = '#1a7a3a';
  a.g.fillRect(0, 92, W, 10);
  a.g.fillStyle = '#c9ced6';
  a.g.fillRect(0, 0, W, 8);
  e.g.fillStyle = '#000';
  e.g.fillRect(0, 0, W, H);
  // 3 doors, windows in between.
  const doors = [0.12, 0.5, 0.88].map((t) => t * W);
  for (const d of doors) {
    a.g.fillStyle = '#7d838c';
    a.g.fillRect(d - 22, 14, 44, 104);
    a.g.fillStyle = '#1b1d22';
    a.g.fillRect(d - 18, 20, 16, 48);
    a.g.fillRect(d + 2, 20, 16, 48);
    e.g.fillStyle = '#c8d4e8';
    e.g.fillRect(d - 18, 20, 16, 48);
    e.g.fillRect(d + 2, 20, 16, 48);
  }
  for (let x = 30; x < W - 30; x += 46) {
    if (doors.some((d) => Math.abs(d - x - 18) < 46)) continue;
    const warm = rnd() < 0.35;
    a.g.fillStyle = '#20242a';
    a.g.fillRect(x, 18, 38, 44);
    e.g.fillStyle = warm ? '#ffe2b8' : '#e2ecff';
    e.g.fillRect(x, 18, 38, 44);
    // Passengers: heads and shoulders, some standing.
    const n = rnd() < 0.3 ? 0 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const px = x + 6 + rnd() * 26;
      const standing = rnd() < 0.4;
      const py = standing ? 28 : 40;
      e.g.fillStyle = 'rgba(10,10,16,0.92)';
      e.g.beginPath();
      e.g.arc(px, py, 5.5, 0, Math.PI * 2);
      e.g.fill();
      e.g.fillRect(px - 9, py + 5, 18, 30);
    }
    // Hanging straps.
    e.g.fillStyle = 'rgba(20,20,30,0.6)';
    for (let s = x + 4; s < x + 36; s += 9) e.g.fillRect(s, 18, 1, 6);
  }
  const t = (c: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  };
  return { map: t(a.c), emissive: t(e.c) };
}

/**
 * A commuter train crossing the overpass: lit windows with passengers, head and tail lights, sparking
 * pantographs, crossing signals that start blinking before it arrives, and window light sliding over
 * the walkway and the street below. `rumble` (0..1) lets other systems shake loose objects.
 */
export class Train {
  group = new THREE.Group();
  light: THREE.PointLight;
  glow: Glow;
  arc: Glow;
  x = -400;
  dir = 1;
  timer = 6;
  /** Seconds of warning (signals + bells) before the train enters. */
  warn = 0;
  active = false;
  rumble = 0;
  onPass: (dir: number) => void = () => {};
  onWarn: () => void = () => {};
  onBell: () => void = () => {};
  private bellT = 0;
  private head: Glow;
  private tail: Glow;
  private headMat: THREE.MeshBasicMaterial;
  private tailMat: THREE.MeshBasicMaterial;
  private signalMat: THREE.MeshBasicMaterial;
  private signals: Glow[] = [];
  private patches: THREE.ShaderMaterial;
  private windowMats: THREE.MeshStandardMaterial[] = [];

  constructor(scene: THREE.Scene, glows: Glows) {
    const body = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.6 });
    const sideMats = [1, 2].map((s) => {
      const t = carTextures(s * 17);
      const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 2.6, roughness: 0.35, metalness: 0.5 });
      this.windowMats.push(m);
      return m;
    });
    const carGeo = new THREE.BoxGeometry(CAR_L, 2.5, 2.9);
    const roofGeo = new THREE.CylinderGeometry(1.45, 1.45, CAR_L, 20, 1, false, -Math.PI / 2, Math.PI);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.scale(1, 0.3, 1);
    const gangGeo = new THREE.BoxGeometry(0.7, 2.2, 2.3);
    const skirtGeo = new THREE.BoxGeometry(CAR_L - 2, 0.5, 2.6);
    const panGeo = new THREE.BoxGeometry(1.6, 0.04, 0.04);
    for (let i = 0; i < CARS; i++) {
      const side = sideMats[i % 2];
      const car = new THREE.Mesh(carGeo, [dark, dark, body, dark, side, side]);
      car.position.set(i * PITCH, CAR_Y, 0);
      const roof = new THREE.Mesh(roofGeo, body);
      roof.position.set(i * PITCH, CAR_Y + 1.25, 0);
      const skirt = new THREE.Mesh(skirtGeo, dark);
      skirt.position.set(i * PITCH, CAR_Y - 1.45, 0);
      this.group.add(car, roof, skirt);
      if (i < CARS - 1) {
        const g = new THREE.Mesh(gangGeo, dark);
        g.position.set(i * PITCH + PITCH / 2, CAR_Y, 0);
        this.group.add(g);
      }
      if (i % 2 === 0) {
        // Diamond pantograph.
        for (const [dx, rz] of [[-0.4, 0.9], [0.4, -0.9], [-0.4, -0.9], [0.4, 0.9]] as const) {
          const arm = new THREE.Mesh(panGeo, dark);
          arm.scale.x = 0.55;
          arm.position.set(i * PITCH + dx, CAR_Y + 1.85 + (rz > 0 ? 0 : 0.5), 0);
          arm.rotation.z = rz;
          this.group.add(arm);
        }
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 1.6), dark);
        shoe.position.set(i * PITCH, CAR_Y + 2.38, 0);
        this.group.add(shoe);
      }
    }
    // Head and tail lamps (the lead car depends on direction; both ends carry both, colour is swapped).
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5) });
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.15) });
    const lampGeo = new THREE.CircleGeometry(0.16, 12);
    const front = -CAR_L / 2 - 0.01;
    const back = (CARS - 1) * PITCH + CAR_L / 2 + 0.01;
    for (const z of [-0.95, 0.95]) {
      const a = new THREE.Mesh(lampGeo, this.headMat);
      a.position.set(front, CAR_Y - 0.7, z);
      a.rotation.y = -Math.PI / 2;
      const b = new THREE.Mesh(lampGeo, this.tailMat);
      b.position.set(back, CAR_Y - 0.7, z);
      b.rotation.y = Math.PI / 2;
      this.group.add(a, b);
    }
    this.group.position.set(this.x, 0, RAIL.z);
    scene.add(this.group);

    this.light = new THREE.PointLight(0xffe8cc, 0, 32, 1.6);
    this.light.position.set(0, 8.6, RAIL.z + 4);
    scene.add(this.light);
    this.glow = glows.add({ pos: new THREE.Vector3(0, 9, RAIL.z), color: new THREE.Color(1.0, 0.9, 0.78), radius: 12, base: 0, mode: 'steady', haloSize: 0.01, haloStrength: 0 });
    this.arc = glows.add({ pos: new THREE.Vector3(0, 11.4, RAIL.z), color: new THREE.Color(0.4, 0.6, 1.0), radius: 10, base: 0, mode: 'steady', haloSize: 5, haloStrength: 0 });
    this.head = glows.add({ pos: new THREE.Vector3(), color: new THREE.Color(1, 0.97, 0.9), radius: 6, base: 0, mode: 'steady', haloSize: 4, haloStrength: 0 });
    this.tail = glows.add({ pos: new THREE.Vector3(), color: new THREE.Color(1, 0.08, 0.05), radius: 4, base: 0, mode: 'steady', haloSize: 2.5, haloStrength: 0 });

    // Crossing signals on the overpass edge facing the plaza.
    this.signalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0, 0) });
    const sigGeo = new THREE.SphereGeometry(0.14, 10, 8);
    for (const x of [-11, 11]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), dark);
      post.position.set(x, RAIL.deckTop + 0.7, RAIL.z + 2.6);
      scene.add(post);
      for (const dx of [-0.25, 0.25]) {
        const s = new THREE.Mesh(sigGeo, this.signalMat);
        s.position.set(x + dx, RAIL.deckTop + 1.3, RAIL.z + 2.7);
        scene.add(s);
      }
      this.signals.push(glows.add({ pos: new THREE.Vector3(x, RAIL.deckTop + 1.3, RAIL.z + 2.8), color: new THREE.Color(1, 0.06, 0.04), radius: 5, base: 0, mode: 'steady', haloSize: 2.2, haloStrength: 0 }));
    }

    // Window light patches sliding across the W1 deck and Railway Street (one plane per surface).
    this.patches = new THREE.ShaderMaterial({
      uniforms: { uX0: { value: 0 }, uX1: { value: 0 }, uVis: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        uniform float uX0, uX1, uVis;
        varying vec3 vW;
        void main() {
          float inside = step(uX0, vW.x) * step(vW.x, uX1);
          float local = mod(vW.x - uX0, ${PITCH.toFixed(2)});
          float win = smoothstep(0.0, 0.25, fract(local / 1.9)) * (1.0 - smoothstep(0.6, 0.85, fract(local / 1.9)));
          win *= step(1.0, local) * step(local, ${(CAR_L - 1).toFixed(2)});
          float warm = step(0.5, fract(floor((vW.x - uX0) / ${PITCH.toFixed(2)}) * 0.5));
          vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.82, 0.6), warm);
          gl_FragColor = vec4(col * win * inside * uVis * 0.22, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const strip = (x0: number, x1: number, z0: number, z1: number, y: number, skew: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      // Patches further from the deck edge are shifted along x: light comes down at an angle.
      for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + pos.getZ(i) * skew);
      const mesh = new THREE.Mesh(g, this.patches);
      mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      mesh.renderOrder = 2;
      scene.add(mesh);
    };
    strip(-15, 15, -14.9, -12.1, 4.51, 0);
    strip(-6, 6, -20.8, -15.2, 0.02, 0);
  }

  /** Forces a pass soon (the intro wants one on cue). */
  trigger(dir: 1 | -1, inSeconds: number) {
    this.active = false;
    this.dir = dir;
    this.timer = inSeconds;
    this.forcedDir = dir;
  }
  private forcedDir: 1 | -1 | 0 = 0;

  /** Puts the train on the overpass right now at `x` (the intro needs it mid-frame on cue). */
  startNow(dir: 1 | -1, x: number) {
    this.active = true;
    this.warn = 0;
    this.dir = dir;
    this.x = x;
    this.group.position.x = x;
    this.onPass(dir);
  }

  update(dt: number) {
    // Crossing signals: alternating blink during warning and while the train is near.
    const near = this.active && Math.abs(this.x + ((CARS - 1) * PITCH) / 2) < 120;
    const signalsOn = this.warn > 0 || near;
    const blink = signalsOn ? (Math.floor(performance.now() / 500) % 2 === 0 ? 1 : 0) : 0;
    this.signals.forEach((g, i) => {
      const on = signalsOn ? (i % 2 === 0 ? blink : 1 - blink) : 0;
      g.base = on * 1.6;
      g.haloStrength = on * 0.7;
    });
    this.signalMat.color.setRGB(signalsOn ? 4 + blink * 2 : 0.2, 0.05, 0.03);
    if (signalsOn) {
      this.bellT -= dt;
      if (this.bellT <= 0) {
        this.bellT = 0.55;
        this.onBell();
      }
    }

    if (!this.active) {
      this.rumble = 0;
      if (this.warn > 0) {
        this.warn -= dt;
        if (this.warn <= 0) {
          this.active = true;
          this.x = this.dir > 0 ? -280 : 140;
          this.onPass(this.dir);
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.dir = this.forcedDir || (Math.random() < 0.5 ? 1 : -1);
          this.forcedDir = 0;
          this.warn = 4;
          this.onWarn();
        }
      }
      this.light.intensity = 0;
      this.glow.base = 0;
      this.arc.haloStrength = 0;
      this.arc.base = 0;
      this.head.base = this.tail.base = 0;
      this.head.haloStrength = this.tail.haloStrength = 0;
      this.patches.uniforms.uVis.value = 0;
      return;
    }
    this.x += this.dir * SPEED * dt;
    this.group.position.x = this.x;
    const len = (CARS - 1) * PITCH;
    const centre = this.x + len / 2;
    // Light follows the train, clamped to the stretch visible from the district.
    const lx = clamp(centre, -24, 24);
    const vis = Math.max(0, 1 - Math.abs(centre - lx) / 70);
    this.light.position.x = lx;
    this.light.intensity = 140 * vis;
    this.glow.pos.set(lx, 8.8, RAIL.z + 2);
    this.glow.base = 1.1 * vis;
    this.rumble = clamp(1 - Math.abs(centre) / 110, 0, 1);
    // Head lamp at the leading end, tail lamp at the back.
    const frontX = this.x - CAR_L / 2;
    const backX = this.x + len + CAR_L / 2;
    const leadX = this.dir > 0 ? backX : frontX;
    const trailX = this.dir > 0 ? frontX : backX;
    this.headMat.color.setRGB(this.dir < 0 ? 6 : 6, this.dir < 0 ? 6 : 0.2, this.dir < 0 ? 5 : 0.15);
    this.tailMat.color.setRGB(6, this.dir > 0 ? 6 : 0.2, this.dir > 0 ? 5 : 0.15);
    this.head.pos.set(leadX + this.dir * 0.6, CAR_Y - 0.7, RAIL.z);
    this.tail.pos.set(trailX - this.dir * 0.4, CAR_Y - 0.7, RAIL.z);
    const inView = (x: number) => (Math.abs(x) < 60 ? 1 : 0);
    this.head.base = 1.6 * inView(leadX);
    this.head.haloStrength = 0.9 * inView(leadX);
    this.tail.base = 1.2 * inView(trailX);
    this.tail.haloStrength = 0.8 * inView(trailX);
    // Window patches below.
    this.patches.uniforms.uX0.value = this.x - CAR_L / 2;
    this.patches.uniforms.uX1.value = this.x + len + CAR_L / 2;
    this.patches.uniforms.uVis.value = 1;
    // Random pantograph arcs.
    const arcOn = Math.random() < 0.04 ? 1 : 0;
    this.arc.pos.set(this.x + Math.floor(Math.random() * 4) * 2 * PITCH, 11.6, RAIL.z);
    this.arc.base = arcOn * 2;
    this.arc.haloStrength = arcOn * 0.9 * (Math.abs(this.arc.pos.x) < 50 ? 1 : 0);
    // Windows flicker slightly as the pickup bounces.
    const fl = 2.6 * (Math.random() < 0.02 ? 0.4 : 1);
    for (const m of this.windowMats) m.emissiveIntensity = fl;
    if ((this.dir > 0 && this.x > 160) || (this.dir < 0 && this.x < -320)) {
      this.active = false;
      this.timer = rand(30, 48);
    }
  }
}
