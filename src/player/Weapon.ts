import * as THREE from 'three';
import { Spring, damp, clamp, easeInOut, easeOut, rand } from '../core/math';
import { flashTexture, makeAmmoDisplay } from '../world/Textures';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Player } from './Player';

const MAG = 12;
const FIRE_INTERVAL = 0.14;
const RELOAD_TIME = 1.35;
const REST = new THREE.Vector3(0.15, -0.145, -0.36);

/**
 * The "Kitsune-9" plasma-assisted pistol. Lives in its own scene rendered on top of the world,
 * so it never clips into walls. All of the feel is here: springs for kick, slide cycling,
 * sway, bob, muzzle flash and a timeline-based reload.
 */
export class Weapon {
  root = new THREE.Group(); // pose
  gun = new THREE.Group(); // recoil target
  slide = new THREE.Group();
  mag = new THREE.Group();
  ammo = MAG;
  maxAmmo = MAG;
  reloading = false;
  private reloadT = 0;
  private reloadStage = 0;
  private cooldown = 0;
  private flashT = 0;
  private flashes: THREE.Mesh[] = [];
  private flashLight: THREE.PointLight;
  fillLight: THREE.PointLight;
  private kickZ = new Spring(260, 20);
  private kickRot = new Spring(220, 17);
  private kickSide = new Spring(200, 18);
  private slideS = new Spring(900, 40);
  private swayX = 0;
  private swayY = 0;
  private raise = 0; // 0 = lowered out of view, 1 = ready
  raiseTarget = 0;
  bloom = 0;
  private sprintBlend = 0;
  private ammoDisplay = makeAmmoDisplay();
  private stripMat: THREE.MeshBasicMaterial;
  muzzleWorld = new THREE.Vector3();
  onReloadDone: () => void = () => {};

  constructor(public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, private audio: AudioEngine) {
    this.build();
    this.scene.add(this.root);
    this.root.add(this.gun);

    const hemi = new THREE.HemisphereLight(0x6070b0, 0x301828, 1.2);
    scene.add(hemi);
    // Cool key from above-left, magenta rim from behind-right: reads as street light on gunmetal.
    const key = new THREE.DirectionalLight(0xa8b8ff, 2.2);
    key.position.set(-1, 2, 0.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff5ac8, 1.6);
    rim.position.set(1.5, 0.5, -1.5);
    scene.add(rim);
    this.fillLight = new THREE.PointLight(0xff40c0, 0, 3, 1.0);
    this.fillLight.position.set(0.4, 0.2, 0.2);
    scene.add(this.fillLight);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2, 1.5);
    this.flashLight.position.set(0.15, -0.05, -0.6);
    scene.add(this.flashLight);
    this.ammoDisplay.draw(this.ammo, MAG, false);
    this.stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 3.0) });
    this.gun.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.strip) o.material = this.stripMat;
    });
  }

  private build() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x6a6e78, metalness: 0.8, roughness: 0.32, envMapIntensity: 1.4 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x2c2e35, metalness: 0.25, roughness: 0.5, envMapIntensity: 1.0 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xb0b5bf, metalness: 0.9, roughness: 0.18, envMapIntensity: 2 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.65, metalness: 0.1 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.8 });
    const strip = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      parent.add(mesh);
      return mesh;
    };
    // Slide (moves on recoil).
    this.gun.add(this.slide);
    box(0.034, 0.03, 0.2, metal, 0, 0.022, -0.005, this.slide);
    box(0.026, 0.008, 0.18, accent, 0, 0.04, -0.01, this.slide);
    for (let i = 0; i < 6; i++) box(0.036, 0.022, 0.003, polymer, 0, 0.022, 0.06 + i * 0.006, this.slide); // serrations
    for (const s of [-1, 1]) {
      const st = box(0.002, 0.004, 0.13, strip, s * 0.0175, 0.016, -0.03, this.slide);
      st.userData.strip = true;
    }
    // Sights.
    box(0.006, 0.008, 0.006, metal, 0, 0.044, -0.098, this.slide);
    const dot = box(0.003, 0.003, 0.002, strip, 0, 0.048, -0.098, this.slide);
    dot.userData.strip = true;
    box(0.026, 0.009, 0.008, metal, 0, 0.042, 0.088, this.slide);
    // Ammo display on the back of the slide.
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.011), new THREE.MeshBasicMaterial({ map: this.ammoDisplay.texture, color: new THREE.Color(1.6, 1.6, 1.6) }));
    disp.position.set(0, 0.024, 0.0955);
    this.slide.add(disp);

    // Frame, rail, barrel shroud with an emissive ring.
    box(0.03, 0.022, 0.17, polymer, 0, -0.004, -0.012, this.gun);
    box(0.02, 0.01, 0.06, polymer, 0, -0.018, -0.07, this.gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.115);
    this.gun.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0018, 6, 16), strip);
    ring.userData.strip = true;
    ring.position.set(0, 0.02, -0.12);
    this.gun.add(ring);
    // Trigger guard and trigger.
    box(0.006, 0.004, 0.05, polymer, 0, -0.034, -0.01, this.gun);
    box(0.006, 0.02, 0.004, polymer, 0, -0.025, -0.035, this.gun);
    box(0.004, 0.016, 0.004, accent, 0, -0.02, -0.005, this.gun, 0.3);
    // Grip with the magazine inside.
    box(0.028, 0.095, 0.042, polymer, 0, -0.058, 0.055, this.gun, 0.22);
    this.mag.position.set(0, -0.06, 0.057);
    this.mag.rotation.x = 0.22;
    this.gun.add(this.mag);
    box(0.02, 0.09, 0.03, metal, 0, -0.012, 0, this.mag);
    box(0.03, 0.01, 0.046, accent, 0, -0.058, 0, this.mag);

    // Gloved hands and sleeve so the gun feels held, not floating.
    const hand = new THREE.Group();
    this.gun.add(hand);
    box(0.04, 0.07, 0.06, glove, 0.006, -0.06, 0.06, hand, 0.22);
    box(0.016, 0.016, 0.05, glove, 0.02, -0.02, 0.03, hand); // thumb
    box(0.038, 0.06, 0.05, glove, -0.024, -0.07, 0.04, hand, 0.4); // support hand
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 10), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.rotation.z = 0.2;
    arm.position.set(0.035, -0.12, 0.24);
    hand.add(arm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.012, 10), strip);
    cuff.userData.strip = true;
    cuff.rotation.copy(arm.rotation);
    cuff.position.set(0.02, -0.09, 0.105);
    hand.add(cuff);
    const arm2 = arm.clone();
    arm2.rotation.z = -0.6;
    arm2.position.set(-0.11, -0.13, 0.22);
    hand.add(arm2);

    // Muzzle flash: two crossed additive cards with a hot core.
    const ft = flashTexture();
    const fm = new THREE.MeshBasicMaterial({ map: ft, color: new THREE.Color(6, 4.2, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    front.position.set(0, 0.02, -0.15);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.09), fm);
    side.rotation.y = Math.PI / 2;
    side.position.set(0, 0.02, -0.2);
    const side2 = side.clone();
    side2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    this.flashes.push(front, side, side2);
    for (const f of this.flashes) {
      f.visible = false;
      f.renderOrder = 10;
      this.gun.add(f);
    }
  }

  get canFire() {
    return !this.reloading && this.cooldown <= 0 && this.raise > 0.9;
  }

  /** Returns true when a round actually left the barrel. */
  tryFire(): boolean {
    if (!this.canFire) return false;
    if (this.ammo <= 0) {
      this.cooldown = 0.3;
      this.audio.dryFire();
      this.startReload();
      return false;
    }
    this.ammo--;
    this.cooldown = FIRE_INTERVAL;
    this.kickZ.impulse(2.4);
    this.kickRot.impulse(14 + rand(-2, 2));
    this.kickSide.impulse(rand(-3, 3));
    this.slideS.value = 0.032;
    this.flashT = 0.05;
    for (const f of this.flashes) {
      f.visible = true;
      f.rotation.z = rand(0, Math.PI * 2);
      f.scale.setScalar(rand(0.8, 1.25));
    }
    this.bloom = Math.min(1, this.bloom + 0.3);
    this.audio.gunshot();
    this.ammoDisplay.draw(this.ammo, MAG, false);
    if (this.ammo === 0) setTimeout(() => this.startReload(), 250);
    return true;
  }

  startReload() {
    if (this.reloading || this.ammo === MAG || this.raise < 0.5) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.ammoDisplay.draw(0, MAG, true);
  }

  reset() {
    this.ammo = MAG;
    this.reloading = false;
    this.ammoDisplay.draw(this.ammo, MAG, false);
  }

  update(dt: number, player: Player, mouseDX: number, mouseDY: number, time: number) {
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 1.8);
    this.raise = damp(this.raise, this.raiseTarget, 5, dt);
    this.kickZ.update(dt);
    this.kickRot.update(dt);
    this.kickSide.update(dt);
    this.slideS.update(dt);

    this.flashT -= dt;
    const flashOn = this.flashT > 0;
    for (const f of this.flashes) f.visible = flashOn;
    this.flashLight.intensity = flashOn ? 3.5 : 0;

    // Reload timeline.
    let rTilt = 0;
    let magY = 0;
    let magVis = true;
    if (this.reloading) {
      this.reloadT += dt;
      const t = this.reloadT;
      rTilt = t < 0.2 ? easeOut(t / 0.2) : t > 1.12 ? 1 - easeInOut((t - 1.12) / (RELOAD_TIME - 1.12)) : 1;
      if (t > 0.22 && this.reloadStage === 0) {
        this.reloadStage = 1;
        this.audio.reload('out');
      }
      if (t > 0.22 && t < 0.5) magY = -easeOut((t - 0.22) / 0.28) * 0.25;
      else if (t >= 0.5 && t < 0.6) magVis = false;
      else if (t >= 0.6 && t < 0.82) magY = -0.25 * (1 - easeOut((t - 0.6) / 0.22));
      if (t > 0.82 && this.reloadStage === 1) {
        this.reloadStage = 2;
        this.audio.reload('in');
        this.kickZ.impulse(-0.8);
        this.ammo = MAG;
        this.ammoDisplay.draw(this.ammo, MAG, false);
      }
      if (t > 0.98 && this.reloadStage === 2) {
        this.reloadStage = 3;
        this.audio.reload('rack');
        this.slideS.value = 0.035;
        this.kickRot.impulse(-4);
      }
      if (t >= RELOAD_TIME) {
        this.reloading = false;
        this.onReloadDone();
      }
    }
    this.mag.position.y = -0.06 + magY;
    this.mag.visible = magVis;
    this.slide.position.z = Math.max(0, this.slideS.value);

    // Sway lags behind mouse movement; bob follows footsteps.
    this.swayX = damp(this.swayX, clamp(-mouseDX * 0.0004, -0.03, 0.03), 10, dt);
    this.swayY = damp(this.swayY, clamp(mouseDY * 0.0004, -0.03, 0.03), 10, dt);
    this.sprintBlend = damp(this.sprintBlend, player.sprinting && !this.reloading ? 1 : 0, 8, dt);
    const bobAmt = player.onGround ? Math.min(player.moveAmount, 1.4) : 0.2;
    const bx = Math.cos(player.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.sin(player.bobPhase)) * 0.01 * bobAmt;
    const idle = Math.sin(time * 1.3) * 0.002;
    const lowered = 1 - this.raise;

    this.root.position.set(
      REST.x + this.swayX + bx + this.sprintBlend * -0.02,
      REST.y + this.swayY + by + idle - lowered * 0.32 - this.sprintBlend * 0.04 - rTilt * 0.03 + player.landDip.value * 0.05,
      REST.z + this.sprintBlend * 0.03,
    );
    this.root.rotation.set(
      lowered * -0.9 + this.sprintBlend * -0.35 + rTilt * 0.3 + this.swayY * 2,
      0.07 + this.sprintBlend * 0.5 + this.swayX * 3,
      rTilt * 0.55 + this.sprintBlend * 0.2 + this.swayX * 2,
    );
    this.gun.position.set(this.kickSide.value * 0.001, this.kickRot.value * 0.0006, this.kickZ.value * 0.025);
    this.gun.rotation.set(this.kickRot.value * 0.02, this.kickSide.value * 0.01, this.kickSide.value * 0.015);

    // Strip glow tracks remaining ammo, flashing red when low.
    const frac = this.ammo / MAG;
    if (this.ammo <= 3 && !this.reloading) {
      const p = 0.5 + 0.5 * Math.sin(time * 10);
      this.stripMat.color.setRGB(2.5 + p, 0.2, 0.4);
    } else {
      this.stripMat.color.setRGB(0.25, 0.6 + 1.8 * frac, 0.8 + 2.2 * frac);
    }
  }
}
