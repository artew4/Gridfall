import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { clamp, damp, rand } from './math';
import { AudioEngine } from '../audio/AudioEngine';
import { CollisionWorld, type RayHit } from '../world/Collision';
import { Glows } from '../world/Glows';
import { City } from '../world/City';
import { buildSigns, type SignGlow } from '../world/Signs';
import { buildProps } from '../world/Props';
import { createStreak, updateStreaks } from '../world/Ground';
import { Rain, Steam } from '../world/Rain';
import { Train } from '../world/Train';
import { smokeTexture } from '../world/Textures';
import { Effects } from '../combat/Effects';
import { Player } from '../player/Player';
import { Weapon } from '../player/Weapon';
import { Projectiles } from '../enemies/Projectiles';
import { Nav } from '../enemies/Nav';
import { Waves } from '../enemies/Waves';
import type { Enemy, EnemyCtx, EnemyHit } from '../enemies/Enemy';
import { Hud, jpNumber } from '../ui/Hud';
import { Intro } from '../cinematic/Intro';

type State = 'title' | 'intro' | 'play' | 'paused' | 'dead';

const PLAYER_START = { x: 0, z: 10, yaw: 0 };
const FOG_COLOR = new THREE.Color(0x0d0b19);

export class Game {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 500);
  weaponScene = new THREE.Scene();
  weaponCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
  fog = new THREE.FogExp2(FOG_COLOR, 0.022);
  time = { value: 0 };
  renderer: Renderer;
  input: Input;
  audio = new AudioEngine();
  col = new CollisionWorld();
  glows = new Glows();
  hud: Hud;
  state: State = 'title';
  private stateBeforePause: State = 'play';

  private city!: City;
  private rain!: Rain;
  private train!: Train;
  private streaks: THREE.Mesh[] = [];
  private signs: SignGlow[] = [];
  private hums: { glow: SignGlow; h: ReturnType<AudioEngine['addHum']>; last: number }[] = [];
  private fx!: Effects;
  private player!: Player;
  private weapon!: Weapon;
  private projectiles!: Projectiles;
  private nav!: Nav;
  private waves = new Waves();
  private intro: Intro | null = null;
  private coverPoints: THREE.Vector3[] = [];
  private occupied = new Set<THREE.Vector3>();
  private hemi!: THREE.HemisphereLight;
  private muzzleLight!: THREE.PointLight;
  private muzzleT = 0;
  private thunderT = 25;
  private thunderFlash = 0;
  private pendingThunder = -1;
  private damageFx = 0;
  private timeScale = 1;
  private deadT = 0;
  private stats = { shots: 0, hits: 0, start: 0 };
  private clock = new THREE.Timer();
  private elapsed = 0;
  private ready = false;
  private ctx!: EnemyCtx;
  private tmpHit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };

  constructor(container: HTMLElement) {
    this.scene.fog = this.fog;
    this.scene.background = FOG_COLOR;
    this.camera.position.set(-3.2, 0.32, 29);
    this.camera.lookAt(0, 0, 18);
    this.weaponScene.add(this.weaponCamera);
    this.renderer = new Renderer(container, this.scene, this.camera, this.weaponScene, this.weaponCamera);
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(document.body);
    this.renderer.grade.uniforms.uFade.value = 1;
  }

  async init() {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts API unavailable: fall back silently */
    }
    // Let the title paint before the heavy procedural build.
    await new Promise((r) => setTimeout(r, 30));
    this.buildWorld();
    this.ready = true;
    this.hud.setReady();
    this.bindUi();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  private buildWorld() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x3a4280, 0x1a0e22, 0.55);
    s.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x5868a8, 0.25);
    moon.position.set(-20, 60, -30);
    s.add(moon);

    this.city = new City(s, this.col, this.glows, this.time, this.fog);
    this.city.build();
    this.signs = buildSigns(this.city.ctx);
    const props = buildProps(this.city.ctx);
    this.city.ctx.builder.build(s);
    this.coverPoints = props.coverPoints;
    this.city.buildSky();

    // Bake an environment map of the lit street once: wet and metal surfaces reflect neon for free.
    this.glows.update(0, new THREE.Vector3());
    const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
    const env = pmrem.fromScene(s, 0.02, 0.1, 300, { position: new THREE.Vector3(0, 3, 0) } as never).texture;
    s.environment = env;
    s.environmentIntensity = 0.9;
    this.weaponScene.environment = env;
    pmrem.dispose();

    for (const g of this.glows.list) {
      if (g.reflect) {
        const m = createStreak(g, this.time, this.fog);
        this.streaks.push(m);
        s.add(m);
      }
    }
    this.train = new Train(s, this.glows);
    this.train.onPass = (dir) => this.audio.trainPass(dir);
    this.glows.buildHalos(s);
    this.rain = new Rain(s, this.glows, this.time, this.fog);
    new Steam(s, this.glows, this.time, props.steamEmitters, smokeTexture(), this.fog);

    this.muzzleLight = new THREE.PointLight(0xffa860, 0, 14, 2);
    s.add(this.muzzleLight);

    this.fx = new Effects(s, this.fog);
    this.fx.onShellBounce = (p, k) => this.audio.shellBounce(p, k);
    this.player = new Player(this.col, this.audio);
    this.player.reset(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    this.weapon = new Weapon(this.weaponScene, this.weaponCamera, this.audio);
    this.projectiles = new Projectiles(s, this.col, this.fx, this.audio);
    this.projectiles.onPlayerHit = (dmg, from) => this.damagePlayer(dmg, from);
    this.nav = new Nav(this.col);

    this.ctx = {
      scene: s,
      player: this.player,
      col: this.col,
      audio: this.audio,
      fx: this.fx,
      nav: this.nav,
      projectiles: this.projectiles,
      time: 0,
      difficulty: 0,
      coverPoints: this.coverPoints,
      occupied: this.occupied,
      enemies: this.waves.enemies,
      damagePlayer: (d, f) => this.damagePlayer(d, f),
    };
    this.waves.onWaveStart = (n) => {
      this.hud.bannerShow(`WAVE ${String(n).padStart(2, '0')}`, `第${jpNumber(n)}波`);
      this.audio.waveStart();
    };
    this.waves.onWaveClear = (n) => {
      this.hud.bannerShow('CLEAR', `第${jpNumber(n)}波 · 突破`, 2.4);
      this.audio.waveClear();
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 35);
    };
    this.waves.onSpawn = (e, at) => {
      if (e.kind === 'gunner') this.audio.clang(at.clone().setY(1.5), 0.7);
    };

    // Compile everything up front so the first shot doesn't hitch.
    this.renderer.renderer.compile(s, this.camera);
  }

  private bindUi() {
    this.hud.title.addEventListener('click', () => {
      if (!this.ready || this.state !== 'title') return;
      this.audio.start();
      this.startAudioWorld();
      this.hud.show(this.hud.title, false);
      this.input.requestLock();
      this.startIntro();
    });
    this.hud.pause.addEventListener('click', () => {
      this.audio.start();
      this.input.requestLock();
    });
    this.hud.death.addEventListener('click', () => {
      if (this.state === 'dead' && this.deadT > 1.2) this.restart();
    });
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'play' || this.state === 'intro') this.input.requestLock();
    });
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'play') {
        this.stateBeforePause = this.state;
        this.state = 'paused';
        this.hud.show(this.hud.pause, true);
      } else if (locked && this.state === 'paused') {
        this.state = this.stateBeforePause;
        this.hud.show(this.hud.pause, false);
      }
    };
    this.input.onAnyKey = () => {
      if (this.state === 'intro' && this.intro && this.intro.t > 0.4) this.intro.skip();
    };
    window.addEventListener('mousedown', () => {
      if (this.state === 'intro' && this.intro && this.intro.t > 0.4) this.intro.skip();
    });
  }

  private startAudioWorld() {
    for (const g of this.signs) {
      if (g.hum) this.hums.push({ glow: g, h: this.audio.addHum(g.pos, 100 + Math.random() * 20), last: 1 });
    }
  }

  private startIntro() {
    this.state = 'intro';
    this.intro = new Intro(this.scene, this.audio, this.projectiles.light);
    this.hud.show(this.hud.skip, true);
    this.hud.skip.style.opacity = '1';
  }

  private beginPlay() {
    this.state = 'play';
    this.intro?.dispose();
    this.intro = null;
    this.hud.skip.style.opacity = '0';
    this.hud.cine.style.opacity = '0';
    this.hud.show(this.hud.root, true);
    this.player.reset(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    this.weapon.raiseTarget = 1;
    this.stats = { shots: 0, hits: 0, start: this.elapsed };
    this.waves.startNext();
    if (!this.input.locked) {
      this.state = 'paused';
      this.stateBeforePause = 'play';
      this.hud.show(this.hud.pause, true);
    }
  }

  private restart() {
    this.hud.show(this.hud.death, false);
    this.waves.reset(this.scene);
    this.occupied.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.weapon.reset();
    this.timeScale = 1;
    this.damageFx = 0;
    this.renderer.grade.uniforms.uFade.value = 0;
    this.input.requestLock();
    this.beginPlay();
  }

  private damagePlayer(dmg: number, from: THREE.Vector3) {
    if (this.state !== 'play' || !this.player.alive) return;
    this.player.damage(dmg, from, this.elapsed);
    this.damageFx = Math.min(1, this.damageFx + 0.6);
    // HUD arrow: angle of the source relative to where we look.
    const ang = Math.atan2(from.x - this.player.pos.x, from.z - this.player.pos.z);
    const rel = -(ang - (this.player.yaw + Math.PI));
    this.hud.damage(rel);
  }

  // ------------------------------------------------------------------ shooting
  private shoot() {
    const cam = this.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const spread = 0.003 + this.player.moveAmount * 0.012 + this.weapon.bloom * 0.018 + (this.player.onGround ? 0 : 0.03);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    this.stats.shots++;

    const wh = this.col.raycast(origin, dir, 200, this.tmpHit);
    let maxDist = wh ? wh.dist : 200;
    let target: Enemy | null = null;
    let eh: EnemyHit | null = null;
    for (const e of this.waves.enemies) {
      const h = e.raycast(origin, dir);
      if (h && h.dist < maxDist) {
        maxDist = h.dist;
        target = e;
        eh = h;
      }
    }
    const muzzle = cam.localToWorld(new THREE.Vector3(0.15, -0.1, -0.55));
    const end = origin.clone().addScaledVector(dir, maxDist);
    this.fx.tracer(muzzle, end);
    this.fx.muzzleSmoke(muzzle, dir);
    this.fx.ejectShell(cam.localToWorld(new THREE.Vector3(0.18, -0.08, -0.35)), right, up);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleT = 0.06;

    if (target && eh) {
      this.stats.hits++;
      const dmg = 34 * eh.mult * rand(0.95, 1.05);
      const killed = target.takeHit(dmg, dir, eh.point, this.ctx);
      this.hud.hitmarker(killed);
      this.audio.hitmarker(killed);
      if (killed) {
        this.waves.kills++;
        this.player.trauma = Math.min(1, this.player.trauma + 0.12);
      }
    } else if (wh) {
      this.fx.impact(wh.point, wh.normal, wh.surface);
      this.audio.hitSurface(wh.point, wh.surface);
    }

    // Camera kick: a bit of permanent climb plus a springy punch.
    this.player.pitch += 0.007;
    this.player.yaw += rand(-0.002, 0.002);
    this.player.kickPitch.impulse(5);
    this.player.kickYaw.impulse(rand(-1.5, 1.5));
    this.player.kickRoll.impulse(rand(-1, 1));
    this.player.fovPunch = 1.6;
    this.player.trauma = Math.min(1, this.player.trauma + 0.08);
  }

  // ------------------------------------------------------------------ frame
  private frame() {
    this.clock.update();
    const rawDt = Math.min(this.clock.getDelta(), 1 / 30);
    const paused = this.state === 'paused';
    const dt = paused ? 0 : rawDt * this.timeScale;
    this.elapsed += dt;
    this.time.value = this.elapsed;
    this.ctx.time = this.elapsed;
    const input = this.input;

    // ---- State logic
    if (this.state === 'title') {
      // Slow ambient drift behind the title.
      const t = this.elapsed;
      this.camera.position.set(-3.2 + Math.sin(t * 0.05) * 0.6, 0.6 + Math.sin(t * 0.13) * 0.1, 27 - Math.sin(t * 0.04) * 2);
      this.camera.lookAt(0.5, 2.4, 0);
      this.renderer.grade.uniforms.uFade.value = damp(this.renderer.grade.uniforms.uFade.value, 0.25, 1.5, rawDt);
    } else if (this.state === 'intro' && this.intro) {
      const f = this.intro.update(dt, this.camera);
      const g = this.renderer.grade.uniforms;
      g.uFade.value = f.fade;
      g.uLetterbox.value = f.letterbox;
      this.hud.cine.style.opacity = f.title ? '1' : '0';
      if (f.raiseWeapon) this.weapon.raiseTarget = 1;
      if (f.hud) this.hud.show(this.hud.root, true);
      if (f.done) this.beginPlay();
    } else if (this.state === 'play' || this.state === 'dead') {
      const controls = this.state === 'play' && input.locked;
      this.player.update(dt, input, controls, this.elapsed);
      if (controls && this.player.alive) {
        if (input.pressed.has('KeyR')) this.weapon.startReload();
        if (input.mouseDown && this.weapon.tryFire()) this.shoot();
      }
      this.player.applyCamera(this.camera, this.elapsed);
      this.ctx.difficulty = this.waves.difficulty;
      this.waves.update(dt, this.ctx);
      this.projectiles.update(dt, this.player);
      if (this.state === 'play' && !this.player.alive) {
        this.state = 'dead';
        this.deadT = 0;
        this.timeScale = 0.35;
        this.weapon.raiseTarget = 0;
        document.exitPointerLock();
      }
      if (this.state === 'dead') {
        this.deadT += rawDt;
        this.renderer.grade.uniforms.uFade.value = clamp(this.deadT * 0.35, 0, 0.6);
        if (this.deadT > 1.2 && this.hud.death.classList.contains('hidden')) {
          this.timeScale = 0.15;
          this.hud.show(this.hud.root, false);
          this.hud.showDeath({
            wave: this.waves.wave,
            kills: this.waves.kills,
            accuracy: this.stats.shots ? this.stats.hits / this.stats.shots : 0,
            time: this.elapsed - this.stats.start,
          });
        }
      }
      // HUD.
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setAmmo(this.weapon.ammo, this.weapon.reloading);
      this.hud.setWave(this.waves.wave, this.waves.remaining, this.waves.state === 'break');
      this.hud.setSpread(4 + this.player.moveAmount * 6 + this.weapon.bloom * 12 + (this.player.onGround ? 0 : 10));
    }

    if (!paused) this.updateWorld(dt, rawDt);
    this.hud.update(rawDt);
    this.audio.updateListener(this.camera);
    if (!paused) this.audio.update(dt, this.camera.position);

    // Weapon camera mirrors the main camera's lens (without sprint FOV, to avoid gun distortion).
    this.weaponCamera.fov = 58;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.render(this.elapsed);
    input.endFrame();
  }

  private updateWorld(dt: number, rawDt: number) {
    const camPos = this.camera.position;
    this.glows.update(this.elapsed, camPos);
    updateStreaks(this.streaks, camPos);
    this.rain.update(this.elapsed, camPos);
    this.train.update(dt);
    this.fx.update(dt);

    // Neon hum follows each sign's flicker; a sudden drop throws sparks.
    for (const h of this.hums) {
      const v = h.glow.value;
      this.audio.setHum(h.h, v);
      if (h.last > 0.7 && v < 0.3 && Math.random() < 0.25) {
        this.audio.sparkCrackle(h.glow.pos);
        this.fx.sparks(h.glow.pos.clone(), new THREE.Vector3(0, -1, 0), 8, new THREE.Color(0.8, 0.9, 1), 2);
      }
      h.last = v;
    }

    // Weapon picks up the colour of nearby neon.
    if (this.weapon) {
      const P = this.glows.uniforms.uGlowPos.value;
      const C = this.glows.uniforms.uGlowCol.value;
      const col = new THREE.Color(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const dx = P[i].x - camPos.x, dy = P[i].y - camPos.y, dz = P[i].z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const k = 1 / (1 + d2 * 0.04);
        col.r += C[i].x * k;
        col.g += C[i].y * k;
        col.b += C[i].z * k;
      }
      const inten = Math.min(2.5, col.r + col.g + col.b);
      if (inten > 0.001) col.multiplyScalar(1 / (col.r + col.g + col.b));
      this.weapon.fillLight.color.copy(col);
      this.weapon.fillLight.intensity = inten * 1.2;
      const md = this.state === 'play' ? this.input.mouseDX : 0;
      const my = this.state === 'play' ? this.input.mouseDY : 0;
      this.weapon.update(dt, this.player, md, my, this.elapsed);
    }

    // Muzzle light pulse.
    this.muzzleT -= dt;
    this.muzzleLight.intensity = this.muzzleT > 0 ? 45 * (this.muzzleT / 0.06) : 0;

    // Thunder: sky flash, then the roll arrives a moment later.
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rand(40, 80);
      this.thunderFlash = 1;
      this.pendingThunder = rand(0.6, 1.6);
    }
    if (this.pendingThunder > 0) {
      this.pendingThunder -= dt;
      if (this.pendingThunder <= 0) this.audio.thunder();
    }
    this.thunderFlash = Math.max(0, this.thunderFlash - dt * 3);
    const flick = this.thunderFlash > 0 ? (Math.random() < 0.7 ? 1 : 0.3) : 0;
    this.hemi.intensity = 0.55 + this.thunderFlash * flick * 5;

    const g = this.renderer.grade.uniforms;
    this.damageFx = Math.max(0, this.damageFx - rawDt * 1.2);
    const low = this.player && this.player.alive && this.player.health < 30 ? 0.25 + Math.sin(this.elapsed * 6) * 0.1 : 0;
    g.uDamage.value = Math.max(this.damageFx, low);
    g.uFlash.value = this.thunderFlash * flick;
  }
}
