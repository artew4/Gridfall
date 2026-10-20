import * as THREE from 'three';
import { buildGuard, buildRunner, disposeRig, type Rig } from '../enemies/Models';
import { clamp, easeInOut, smoothstep } from '../core/math';
import type { IntroFrame } from './Intro';

export interface StoryIntroHost {
  scene: THREE.Scene;
  /** Subtitles. */
  say(speaker: string, text: string, seconds?: number): void;
  /** Sounds used by the sequence. */
  sfx(kind: 'radio' | 'siren' | 'phone' | 'train'): void;
  /** The billboard shows the wanted notice (true) or cycles (false). */
  wanted(on: boolean): void;
  /** An idle scene light borrowed for rim and phone light (adding one would recompile shaders). */
  light: THREE.PointLight;
}

interface Shot {
  from: number;
  to: number;
  /** Camera path and gaze over the shot (0..1). */
  cam: (k: number, t: number) => { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);

/** Where the protagonist hides: the player's start in the back alley, facing the alley mouth (+x). */
export const HIDE = v(-11, 0, 25.5);
const BILLBOARD = v(10.5, 20, -16.4);
/** The patrol that passes the alley mouth on Lantern Street. */
const PATROL_FROM = v(-1.6, 0, 18.5);
const PATROL_TO = v(-1.6, 0, 33);

/** Seconds; skipping jumps to the hand-over into first person. */
export const STORY_INTRO_LENGTH = 50;
const HANDOVER = 45;

/**
 * The story opening (~50 s, skippable), five shots:
 * 1. 0–10   The city: a high, slow crane over the rainy plaza — crowds under umbrellas, a patrol,
 *           a train crossing the overpass. A news line sets up the bombing.
 * 2. 10–20  The manhunt: a push towards the rooftop billboard as it switches to Kurogane's wanted
 *           notice; dispatch puts every unit on the fugitive.
 * 3. 20–32  The protagonist: low in the back alley, hood up, while a patrol walks past the mouth.
 * 4. 32–45  Kenji's message on the phone: the lockdown, the railway, the ramen stall.
 * 5. 45–50  The camera moves into his eyes; the game begins with FIND KENJI.
 * The district is already live (civilians walk, patrols walk their routes, blind to the player).
 */
export class StoryIntro {
  t = 0;
  readonly duration = STORY_INTRO_LENGTH;
  private hero: Rig;
  private patrol: Rig;
  private phone: THREE.Mesh;
  private phoneMat: THREE.MeshBasicMaterial;
  private cues = new Set<string>();
  private m = new THREE.Matrix4();
  private shots: Shot[];
  private lightSaved: { color: THREE.Color; distance: number; decay: number };
  private _wp = new THREE.Vector3();

  constructor(private host: StoryIntroHost, private endPos: THREE.Vector3, private endLook: THREE.Vector3) {
    const scene = host.scene;
    const l = host.light;
    this.lightSaved = { color: l.color.clone(), distance: l.distance, decay: l.decay };
    // The protagonist: the hooded frame, without the blade lights — a man in a dark coat.
    this.hero = buildRunner();
    this.hero.glowMat.color.setScalar(0);
    this.hero.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === this.hero.glowMat) o.visible = false;
    });
    this.hero.root.position.copy(HIDE);
    this.hero.root.rotation.y = Math.PI / 2;
    scene.add(this.hero.root);
    this.phoneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.01), this.phoneMat);
    this.phone.position.set(0, -0.3, 0.06);
    this.phone.rotation.x = -0.6;
    this.hero.foreR.add(this.phone);
    // A security officer on his beat across the alley mouth.
    this.patrol = buildGuard();
    this.patrol.root.position.copy(PATROL_FROM);
    this.patrol.root.visible = false;
    scene.add(this.patrol.root);

    this.shots = [
      {
        from: 0,
        to: 10,
        cam: (k) => ({
          // A slow crane down over the plaza: the fountain, people under umbrellas, the overpass.
          pos: lerp(v(-7, 13, 13), v(-3.5, 8, 9.5), easeInOut(k)),
          look: lerp(v(3, 0, -4), v(2, 2.2, -10), easeInOut(k)),
          fov: 52,
        }),
      },
      {
        from: 10,
        to: 20,
        cam: (k) => ({
          pos: lerp(v(1.5, 2.6, 9), v(4.5, 6.5, -1), easeInOut(k)),
          look: lerp(v(8, 9, -14), BILLBOARD, smoothstep(0, 0.6, k)),
          fov: 52 - 14 * smoothstep(0.35, 1, k),
        }),
      },
      {
        from: 20,
        to: 32,
        cam: (k, t) => ({
          pos: lerp(v(-15.6, 0.95, 26.1), v(-14.8, 1.05, 25.9), k).add(v(0, Math.sin(t * 0.9) * 0.02, 0)),
          look: lerp(v(-5, 1.4, 25.4), v(-3, 1.3, 25.2), k),
          fov: 46,
        }),
      },
      {
        from: 32,
        to: HANDOVER,
        cam: (k) => ({
          // Medium shot from the alley mouth side: his face in the phone's light, the alley behind.
          pos: lerp(v(-8.2, 1.25, 26.4), v(-8.6, 1.2, 26.3), k),
          look: v(-11, 0.85, 25.45),
          fov: 44,
        }),
      },
    ];
  }

  skip() {
    if (this.t < HANDOVER - 0.5) {
      this.t = HANDOVER - 0.5;
      // Lines from skipped shots must not trail into the game; the last message is kept short.
      this.cues.add('skipped');
    }
  }

  private cue(key: string, at: number, fn: () => void) {
    if (this.t >= at && !this.cues.has(key)) {
      this.cues.add(key);
      if (!this.cues.has('skipped') || key.startsWith('end')) fn();
    }
  }

  update(dt: number, cam: THREE.PerspectiveCamera): IntroFrame {
    this.t += dt;
    const t = this.t;
    const h = this.host;

    // ---- story beats
    this.cue('train', 0.5, () => h.sfx('train'));
    this.cue('news', 3.2, () => h.say('NEWS', '…the suspect in tonight’s Kurogane data-vault bombing is still at large in Shinjuku.', 5));
    this.cue('wanted', 12.5, () => h.wanted(true));
    this.cue('radio1', 13, () => {
      h.sfx('radio');
      h.say('DISPATCH', 'All units, Sector Seven: fugitive confirmed — Arashi, Kaito. Ex-Kurogane contractor. Armed.', 4.6);
    });
    this.cue('siren', 15, () => h.sfx('siren'));
    this.cue('radio2', 17.8, () => {
      h.sfx('radio');
      h.say('DISPATCH', 'The district is sealed. Units on Lantern Street, sweep the alleys.', 4);
    });
    this.cue('phone', 32.4, () => h.sfx('phone'));
    this.cue('k1', 33.2, () => h.say('KENJI (TEXT)', 'Listen carefully. They’ve locked down the district.', 3.6));
    this.cue('k2', 36.9, () => h.say('KENJI (TEXT)', 'Your only way out is the railway — the last train tonight.', 3.6));
    this.cue('k3', 40.6, () => h.say('KENJI (TEXT)', 'Meet me at the ramen stall in the Fountain Plaza. Before the last train.', 4.2));
    this.cue('endWanted', HANDOVER, () => h.wanted(false));

    // ---- camera
    const shot = this.shots.find((s) => t < s.to) ?? this.shots[this.shots.length - 1];
    const k = clamp((t - shot.from) / (shot.to - shot.from), 0, 1);
    const c = shot.cam(k, t);
    this.m.lookAt(c.pos, c.look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(this.m);
    // Hand-over: from the last shot into his eyes.
    const b = easeInOut(clamp((t - HANDOVER) / 3.2, 0, 1));
    if (b > 0) {
      const last = this.shots[3].cam(1, t);
      this.m.lookAt(last.pos, last.look, new THREE.Vector3(0, 1, 0));
      const q0 = new THREE.Quaternion().setFromRotationMatrix(this.m);
      this.m.lookAt(this.endPos, this.endLook, new THREE.Vector3(0, 1, 0));
      const q1 = new THREE.Quaternion().setFromRotationMatrix(this.m);
      cam.position.copy(last.pos).lerp(this.endPos, b);
      cam.quaternion.copy(q0).slerp(q1, b);
      cam.fov = last.fov + (74 - last.fov) * b;
    } else {
      cam.position.copy(c.pos);
      cam.quaternion.copy(q);
      cam.fov = c.fov;
    }
    cam.updateProjectionMatrix();

    // ---- actors
    const hero = this.hero;
    // Crouched against the wall, breathing; looks up when the patrol passes, then at the phone.
    const crouch = 1 - smoothstep(HANDOVER - 1, HANDOVER + 1, t);
    hero.body.position.y = (hero.body.userData.baseY ?? 0.95) - 0.32 * crouch + Math.sin(t * 2.1) * 0.012;
    hero.legL.rotation.x = -0.9 * crouch;
    hero.legR.rotation.x = -0.5 * crouch;
    hero.kneeL.rotation.x = 1.5 * crouch;
    hero.kneeR.rotation.x = 1.0 * crouch;
    hero.body.rotation.x = 0.22 * crouch;
    const watching = smoothstep(23, 24, t) * (1 - smoothstep(30, 31, t));
    hero.head.rotation.y = 0.15 * watching + Math.sin(t * 0.6) * 0.05;
    const phoneUp = smoothstep(32.2, 33, t) * (1 - smoothstep(43.8, 44.6, t));
    hero.armR.rotation.x = -1.15 * phoneUp - 0.2;
    hero.foreR.rotation.x = -1.2 * phoneUp;
    hero.head.rotation.x = 0.42 * phoneUp;
    const glow = phoneUp * (0.8 + 0.2 * Math.sin(t * 6));
    this.phoneMat.color.setRGB(0.6 * glow, 2.2 * glow, 3 * glow);
    // Light: a cold rim from the alley mouth while he hides, then the phone on his face.
    const l = this.host.light;
    l.decay = 2;
    if (t > 20 && t < 32) {
      l.color.setRGB(0.55, 0.8, 1);
      l.distance = 7;
      l.position.set(-9.2, 2.6, 24.6);
      l.intensity = 9 * smoothstep(20, 21, t) * (1 - smoothstep(31, 32, t));
    } else if (phoneUp > 0) {
      l.color.setRGB(0.45, 0.85, 1);
      l.distance = 2.6;
      this.phone.getWorldPosition(this._wp);
      l.position.copy(this._wp).add(new THREE.Vector3(0.25, 0.25, 0.1));
      l.intensity = 4 * glow;
    } else l.intensity = 0;
    // He disappears as the camera takes his place (before it could pass through him).
    hero.root.visible = cam.position.distanceTo(this.endPos) > 1.1;

    // The patrol crosses the alley mouth during shot 3.
    const pk = clamp((t - 21.5) / 9, 0, 1);
    const pr = this.patrol;
    pr.root.visible = t > 20 && t < 32;
    pr.root.position.copy(PATROL_FROM).lerp(PATROL_TO, pk);
    pr.root.rotation.y = 0;
    const ph = t * 5.2;
    pr.legL.rotation.x = Math.sin(ph) * 0.45;
    pr.legR.rotation.x = -Math.sin(ph) * 0.45;
    pr.head.rotation.y = -0.6 * smoothstep(24.5, 25.5, t) * (1 - smoothstep(27, 28, t));
    const beacon = pr.root.userData.beacon as THREE.MeshBasicMaterial | undefined;
    beacon?.color.setRGB(0.6, 0.15, 0.2);

    // Dips to black between shots, and the fade in.
    const dip = (at: number) => 1 - smoothstep(0, 0.55, Math.abs(t - at));
    const fade = Math.max(t < 1.5 ? 1 - smoothstep(0.3, 1.5, t) : 0, dip(10), dip(20), dip(32) * 0.85);

    return {
      fade,
      letterbox: 1 - smoothstep(HANDOVER, HANDOVER + 2.6, t),
      title: t > 4 && t < 9,
      hud: t > HANDOVER + 2.8,
      raiseWeapon: false,
      done: t >= this.duration,
    };
  }

  /** Camera samples over the whole sequence (DEV check for clipping into geometry). */
  cameraSamples(step = 0.25) {
    const out: { t: number; pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
    for (const sh of this.shots)
      for (let t = sh.from; t <= sh.to; t += step) {
        const c = sh.cam((t - sh.from) / (sh.to - sh.from), t);
        out.push({ t, pos: c.pos, look: c.look });
      }
    return out;
  }

  dispose() {
    const scene = this.host.scene;
    const l = this.host.light;
    l.color.copy(this.lightSaved.color);
    l.distance = this.lightSaved.distance;
    l.decay = this.lightSaved.decay;
    l.intensity = 0;
    scene.remove(this.hero.root);
    scene.remove(this.patrol.root);
    for (const r of [this.hero, this.patrol]) {
      disposeRig(r);
      r.armorMat.dispose();
      r.clothMat.dispose();
      r.glowMat.dispose();
    }
    this.phone.geometry.dispose();
    this.phoneMat.dispose();
  }
}
