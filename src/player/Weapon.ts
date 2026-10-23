import * as THREE from 'three';
import { Spring, damp, clamp, easeInOut, easeOut, lerp, rand } from '../core/math';
import { flashTexture, makeAmmoDisplay } from '../world/Textures';
import type { AudioEngine } from '../audio/AudioEngine';
import { reloadKind } from '../audio/ReloadSynth';
import type { Player } from './Player';
import type { WeaponSpec } from '../entities/types';
import { KITSUNE_9 } from '../entities/weapons/kitsune9';
import { ballisticFor, gunMats, stripColour, type GunTheme } from '../entities/weapons/theme';

/** The reload timeline below is authored for this length and scaled to each weapon's. */
const BASE_RELOAD = 1.35;

/**
 * The player's viewmodel. Lives in its own scene rendered on top of the world, so it never clips
 * into walls. The mechanics are here (springs for kick, slide or bolt cycling, sway, bob, muzzle
 * flash, a timeline-based reload); the model and the numbers come from the level's WeaponSpec.
 */
export class Weapon {
  root = new THREE.Group(); // pose
  gun = new THREE.Group(); // recoil target
  slide = new THREE.Group();
  mag = new THREE.Group();
  spec: WeaponSpec = KITSUNE_9;
  ammo = KITSUNE_9.mag;
  maxAmmo = KITSUNE_9.mag;
  private magRest = new THREE.Vector3();
  private flashTex: THREE.Texture | null = null;
  reloading = false;
  private reloadT = 0;
  private autoReloadT = 0;
  private reloadStage = 0;
  /** 26.0: a tube gun reloaded from empty racks its pump once the tube is full. */
  private rackAfter = false;
  private cooldown = 0;
  /** Time since the last shot (drives the pump cycle); Infinity when idle. */
  private cycleT = Infinity;
  private cycleSound = false;
  /** Rounds loaded so far in a one-at-a-time reload. */
  private loaded = 0;
  private loadTilt = 0;
  private flashT = 0;
  private flashes: THREE.Mesh[] = [];
  private flashLight: THREE.PointLight;
  fillLight: THREE.PointLight;
  /** The viewmodel's own light rig (a level may relight it; setLights(null) restores the night look). */
  private rig!: { hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; rim: THREE.DirectionalLight };
  private static NIGHT = { sky: 0x6070b0, ground: 0x301828, hemi: 1.2, key: 0xa8b8ff, keyI: 2.2, rim: 0xff5ac8, rimI: 1.6 };

  /** Relight the viewmodel for a setting (null: the default night-city rig). */
  setLights(l: { sky: number; ground: number; hemi: number; key: number; keyI: number; rim: number; rimI: number } | null) {
    const v = l ?? Weapon.NIGHT;
    this.rig.hemi.color.set(v.sky);
    this.rig.hemi.groundColor.set(v.ground);
    this.rig.hemi.intensity = v.hemi;
    this.rig.key.color.set(v.key);
    this.rig.key.intensity = v.keyI;
    this.rig.rim.color.set(v.rim);
    this.rig.rim.intensity = v.rimI;
  }

  /** Scale the key light (a level dims it indoors or in a storm). */
  setKey(k: number) {
    this.rig.key.intensity = k;
  }
  private kickZ = new Spring(260, 20);
  private kickRot = new Spring(220, 17);
  private kickSide = new Spring(200, 18);
  private slideS = new Spring(900, 40);
  private swayX = 0;
  private swayY = 0;
  private raise = 0; // 0 = lowered out of view, 1 = ready
  raiseTarget = 0;
  /** Weapon put away: hidden, cannot fire, draws less attention. */
  holstered = false;
  bloom = 0;
  private sprintBlend = 0;
  private ammoDisplay = makeAmmoDisplay();
  private stripMat: THREE.MeshBasicMaterial;
  /** 21.0: the finish the gun was built in (the map's), and the strips' full-ammo colour in it (null: no glow). */
  theme: GunTheme = 'blaster';
  private stripBase: THREE.Color | null = null;
  muzzleWorld = new THREE.Vector3();
  onReloadDone: () => void = () => {};

  constructor(public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, private audio: AudioEngine, spec: WeaponSpec = KITSUNE_9) {
    this.stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 3.0) });
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
    this.rig = { hemi, key, rim };
    this.fillLight = new THREE.PointLight(0xff40c0, 0, 3, 1.0);
    this.fillLight.position.set(0.4, 0.2, 0.2);
    scene.add(this.fillLight);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2, 1.5);
    this.flashLight.position.set(0.15, -0.05, -0.6);
    scene.add(this.flashLight);
    this.setSpec(spec);
  }

  /**
   * Swap the weapon (13.0: the loadout's pick, or the story's own). The previous model is freed: the viewmodel outlives levels,
   * so anything left behind here would leak across every switch.
   */
  /** 26.0: whose reload this gun plays (ReloadSynth). */
  get reloadKind() {
    return reloadKind(this.spec.sound);
  }

  setSpec(spec: WeaponSpec, theme: GunTheme = this.theme) {
    if (this.spec === spec && this.theme === theme && this.gun.children.length) return;
    this.disposeModel();
    this.spec = spec;
    this.theme = theme;
    this.slide.position.set(0, 0, 0);
    this.mag.position.set(0, 0, 0);
    this.mag.rotation.set(0, 0, 0);
    const mats = gunMats(theme);
    spec.build({ gun: this.gun, slide: this.slide, mag: this.mag, display: this.ammoDisplay.texture, mats });
    this.magRest.copy(this.mag.position);
    // Muzzle flash: two crossed additive cards with a hot core, at the weapon's muzzle.
    const [fx, fy, fz] = spec.flash.at;
    const k = spec.flash.size;
    this.flashTex = flashTexture();
    const fm = new THREE.MeshBasicMaterial({ map: this.flashTex, color: new THREE.Color(...spec.flash.color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * k, 0.16 * k), fm);
    front.position.set(fx, fy, fz);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * k, 0.09 * k), fm);
    side.rotation.y = Math.PI / 2;
    side.position.set(fx, fy, fz - 0.05 * k);
    const side2 = side.clone();
    side2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    this.flashes = [front, side, side2];
    for (const f of this.flashes) {
      f.visible = false;
      f.renderOrder = 10;
      this.gun.add(f);
    }
    this.flashLight.color.set(spec.flash.light);
    this.flashLight.position.set(spec.muzzle[0], spec.muzzle[1] + 0.05, spec.muzzle[2] + 0.1);
    // The strips take the shared ammo-strip material where the theme glows (on a military finish they
    // stay plain metal). A material only the strips used is freed here: nothing else will.
    this.stripBase = stripColour(theme);
    if (this.stripBase) {
      this.stripMat.color.copy(this.stripBase);
      const replaced = new Set<THREE.Material>(), used = new Set<THREE.Material>();
      this.gun.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.userData.strip) {
          replaced.add(o.material as THREE.Material);
          o.material = this.stripMat;
        } else used.add(o.material as THREE.Material);
      });
      for (const m of replaced) if (!used.has(m)) m.dispose();
    }
    this.maxAmmo = spec.mag;
    this.reset();
  }

  private disposeModel() {
    const mats = new Set<THREE.Material>();
    this.gun.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat !== this.stripMat) mats.add(mat);
    });
    for (const m of mats) m.dispose();
    this.flashTex?.dispose();
    this.flashTex = null;
    this.slide.clear();
    this.mag.clear();
    this.gun.clear();
    this.flashes = [];
  }

  /** 21.0: what the gun fires in its finish (every gun kinetic on a military map). */
  get ballistic() {
    return ballisticFor(this.spec.ballistic, this.theme);
  }

  /** 21.0: the report: the energy pistol's plasma becomes a plain pistol crack when it fires kinetic. */
  get sound() {
    return this.spec.sound === 'plasma' && this.ballistic === 'kinetic' ? 'pistol' : this.spec.sound;
  }

  /** "Low" for the HUD and the strips: three rounds on a pistol, a fifth of a rifle magazine. */
  get lowAmmo() {
    return Math.max(3, Math.round(this.spec.mag * 0.2));
  }

  get canFire() {
    // A tube magazine can fire between shells: the trigger interrupts the reload.
    const loading = this.reloading && !(this.spec.perRound && this.ammo > 0);
    return !this.holstered && !loading && this.cooldown <= 0 && this.raise > 0.9;
  }

  /** The gun can be seen by others (drawn, or still coming up). */
  get visible() {
    return !this.holstered && this.raise > 0.35;
  }

  /** 11.0: the sights can come up (drawn, ready, not reloading). */
  get canAim() {
    return !this.holstered && !this.reloading && this.raise > 0.5;
  }

  /**
   * A camera-space point of the gun (the muzzle, the ejection port) now: the spec gives it at the hip;
   * with the sights up the whole gun has moved by (ADS pose − hip rest), blended by `ads`.
   */
  camPoint(p: readonly [number, number, number], ads: number, out: THREE.Vector3) {
    const [rx, ry, rz] = this.spec.rest;
    const a = this.spec.ads;
    return out.set(p[0] + (-a.sight[0] - rx) * ads, p[1] + (-a.sight[1] - ry) * ads, p[2] + (a.z - rz) * ads);
  }

  /** 0 = put away, 1 = ready. */
  get readiness() {
    return this.raise;
  }

  /** H: put the gun away or draw it. A reload in progress is abandoned (the magazine stays as it was). */
  toggleHolster() {
    this.setHolstered(!this.holstered);
  }

  setHolstered(h: boolean, silent = false) {
    if (h === this.holstered) return;
    this.holstered = h;
    if (h) {
      if (this.reloading) {
        this.reloading = false;
        this.ammoDisplay.draw(this.ammo, this.spec.mag, false);
      }
      this.autoReloadT = 0;
      this.raiseTarget = 0;
    } else {
      this.raiseTarget = 1;
    }
    if (!silent) this.audio.holster(h);
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
    if (this.reloading) this.reloading = false;
    this.ammo--;
    const k = this.spec.kick;
    this.cycleT = 0;
    this.cooldown = this.spec.fireInterval;
    this.kickZ.impulse(k.z);
    this.kickRot.impulse(k.rot + rand(-k.rotJitter, k.rotJitter));
    this.kickSide.impulse(rand(-k.side, k.side));
    this.slideS.value = k.slide;
    this.flashT = 0.05;
    for (const f of this.flashes) {
      f.visible = true;
      f.rotation.z = rand(0, Math.PI * 2);
      f.scale.setScalar(rand(0.8, 1.25));
    }
    this.bloom = Math.min(1, this.bloom + this.spec.bloomPerShot);
    this.audio.gunshot(this.sound, this.ballistic === 'energy');
    this.ammoDisplay.draw(this.ammo, this.spec.mag, false);
    // Auto-reload on empty after the same short beat as before, but on the game clock (pauses with it).
    if (this.ammo === 0) this.autoReloadT = 0.25;
    return true;
  }

  startReload() {
    if (this.holstered || this.reloading || this.ammo === this.spec.mag || this.raise < 0.5) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.loaded = 0;
    this.rackAfter = this.ammo === 0;
    this.ammoDisplay.draw(0, this.spec.mag, true);
  }

  reset() {
    this.ammo = this.spec.mag;
    this.reloading = false;
    this.autoReloadT = 0;
    this.cycleT = Infinity;
    this.loadTilt = 0;
    this.ammoDisplay.draw(this.ammo, this.spec.mag, false);
  }

  update(dt: number, player: Player, mouseDX: number, mouseDY: number, time: number) {
    if (this.autoReloadT > 0) {
      this.autoReloadT -= dt;
      if (this.autoReloadT <= 0) this.startReload();
    }
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 1.8);
    // Drawing is quick (ready in ~0.25 s) so combat never waits on it; holstering is a touch slower.
    // 21.0: how quick is the gun's own (the pistol's 22: ready in ~0.12 s; the shotgun's 7: ~0.35 s).
    const target = this.holstered ? 0 : this.raiseTarget;
    this.raise = damp(this.raise, target, this.holstered ? 8 : this.raiseTarget > this.raise ? this.spec.handling.raise : 5, dt);
    this.root.visible = this.raise > 0.015;
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
    const pr = this.spec.perRound;
    if (this.reloading && pr) {
      // Tube magazine: tilt in, then a shell pushed in every `each` seconds until full.
      this.reloadT += dt;
      const t = this.reloadT;
      const into = t - pr.open;
      magVis = into > 0;
      if (into > 0) {
        const phase = (into % pr.each) / pr.each;
        // The shell rises from the hand into the loading port, then the hand drops for the next.
        magY = phase < 0.6 ? -0.12 * (1 - easeOut(phase / 0.6)) : -0.12 * easeOut((phase - 0.6) / 0.4);
        // A shell is in when the hand reaches the port (60% through each cycle).
        const should = Math.floor(into / pr.each + 0.4);
        if (should > this.loaded && this.ammo < this.spec.mag) {
          this.loaded = should;
          this.ammo++;
          this.audio.reload('in', this.reloadKind);
          this.kickZ.impulse(-0.5);
          this.ammoDisplay.draw(this.ammo, this.spec.mag, false);
        }
      } else magY = -0.12;
      if (this.ammo >= this.spec.mag) {
        this.reloading = false;
        // Chamber one: the pump's own cycle (its fore-end and its cha-chunk), as after a shot.
        if (this.rackAfter) this.cycleT = 0;
        this.onReloadDone();
      }
    } else if (pr) magVis = false;
    if (pr) {
      // Tilted for loading while reloading; eases back when full or when the trigger interrupts.
      this.loadTilt = damp(this.loadTilt, this.reloading ? 1 : 0, 9, dt);
      rTilt = this.loadTilt;
    } else if (this.reloading) {
      this.reloadT += dt;
      // Authored for BASE_RELOAD; a slower weapon plays the same beats stretched.
      const t = (this.reloadT * BASE_RELOAD) / this.spec.reloadTime;
      rTilt = t < 0.2 ? easeOut(t / 0.2) : t > 1.12 ? 1 - easeInOut((t - 1.12) / (BASE_RELOAD - 1.12)) : 1;
      if (t > 0.22 && this.reloadStage === 0) {
        this.reloadStage = 1;
        this.audio.reload('out', this.reloadKind);
      }
      if (t > 0.22 && t < 0.5) magY = -easeOut((t - 0.22) / 0.28) * 0.25;
      else if (t >= 0.5 && t < 0.6) magVis = false;
      else if (t >= 0.6 && t < 0.82) magY = -0.25 * (1 - easeOut((t - 0.6) / 0.22));
      if (t > 0.82 && this.reloadStage === 1) {
        this.reloadStage = 2;
        this.audio.reload('in', this.reloadKind);
        this.kickZ.impulse(-0.8);
        this.ammo = this.spec.mag;
        this.ammoDisplay.draw(this.ammo, this.spec.mag, false);
      }
      if (t > 0.98 && this.reloadStage === 2) {
        this.reloadStage = 3;
        this.audio.reload('rack', this.reloadKind);
        this.slideS.value = 0.035;
        this.kickRot.impulse(-4);
      }
      if (t >= BASE_RELOAD) {
        this.reloading = false;
        this.onReloadDone();
      }
    }
    this.mag.position.y = this.magRest.y + magY;
    this.mag.visible = magVis;
    this.slide.position.z = Math.max(0, this.slideS.value);
    // Pump action: the fore-end comes back and goes forward again after each shot.
    const cy = this.spec.cycle;
    if (cy) {
      this.cycleT += dt;
      const t = this.cycleT - cy.start;
      let z = 0;
      if (t > 0 && t < cy.back) z = cy.travel * easeOut(t / cy.back);
      else if (t >= cy.back && t < cy.back + cy.forward) z = cy.travel * (1 - easeInOut((t - cy.back) / cy.forward));
      if (t > 0 && !this.cycleSound) {
        this.cycleSound = true;
        this.audio.pump();
      }
      if (this.cycleT < cy.start) this.cycleSound = false;
      this.slide.position.z = z;
    }

    // Sway lags behind mouse movement; bob follows footsteps.
    this.swayX = damp(this.swayX, clamp(-mouseDX * 0.0004, -0.03, 0.03), 10, dt);
    this.swayY = damp(this.swayY, clamp(mouseDY * 0.0004, -0.03, 0.03), 10, dt);
    // 43.0: the pull-up lowers it as a sprint does (both hands on the ledge).
    this.sprintBlend = damp(this.sprintBlend, (player.sprinting || player.mantling) && !this.reloading ? 1 : 0, player.mantling ? 16 : 8, dt);
    const bobAmt = player.onGround ? Math.min(player.moveAmount, 1.4) : 0.2;
    const bx = Math.cos(player.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.sin(player.bobPhase)) * 0.01 * bobAmt;
    const idle = Math.sin(time * 1.3) * 0.002;
    const lowered = 1 - this.raise;

    // 11.0, ADS: blend the hip pose (rest, sprint, reload tilt, lowering) towards the sight pose by
    // `player.ads` (already eased: smoothstep of a linear clock). At e = 1 the root is unrotated and
    // sits at (−sight.x, −sight.y, ads.z), so the sight is on the camera axis. Sway, bob and idle are
    // added on top and mostly fade out (a steadied gun still drifts a little behind the mouse); the
    // kick springs are scaled down so the sight doesn't jump off the target.
    const e = player.ads;
    const loose = 1 - 0.85 * e;
    const [rx, ry, rz] = this.spec.rest;
    const a = this.spec.ads;
    const hx = rx + this.sprintBlend * -0.02;
    const hy = ry - lowered * 0.32 - this.sprintBlend * 0.04 - rTilt * 0.03;
    const hz = rz + this.sprintBlend * 0.03;
    this.root.position.set(
      lerp(hx, -a.sight[0], e) + (this.swayX + bx) * loose,
      lerp(hy, -a.sight[1], e) + (this.swayY + by + idle + player.landDip.value * 0.05) * loose,
      lerp(hz, a.z, e),
    );
    this.root.rotation.set(
      lerp(lowered * -0.9 + this.sprintBlend * -0.35 + rTilt * 0.3, 0, e) + this.swayY * 2 * loose,
      lerp(0.07 + this.sprintBlend * 0.5, 0, e) + this.swayX * 3 * loose,
      lerp(rTilt * 0.55 + this.sprintBlend * 0.2, 0, e) + this.swayX * 2 * loose,
    );
    const kick = lerp(1, 0.4, e);
    this.gun.position.set(this.kickSide.value * 0.001 * kick, this.kickRot.value * 0.0006 * kick, this.kickZ.value * 0.025 * kick);
    this.gun.rotation.set(this.kickRot.value * 0.02 * kick, this.kickSide.value * 0.01 * kick, this.kickSide.value * 0.015 * kick);

    // Strip glow tracks remaining ammo, flashing red when low.
    // 21.0: in the theme's own colour (the corporate LED dimmer than the blaster neon), none on military.
    if (!this.spec.ammoGlow || !this.stripBase) return;
    const frac = this.ammo / this.spec.mag;
    const b = this.stripBase, k = b.b / 3;
    if (this.ammo <= this.lowAmmo && !this.reloading) {
      const p = 0.5 + 0.5 * Math.sin(time * 10);
      this.stripMat.color.setRGB((2.5 + p) * k, 0.2 * k, 0.4 * k);
    } else {
      const f = 0.25 + 0.75 * frac;
      this.stripMat.color.setRGB(b.r * (0.8 + 0.2 * frac), b.g * f, b.b * f);
    }
  }
}
