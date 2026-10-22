import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uAberration: { value: 0.0015 },
    uFade: { value: 1 },
    uLetterbox: { value: 0 },
    uAspect: { value: 1 },
    uFlash: { value: 0 },
    uShadowTint: { value: [0.012, 0.01, 0.03] as [number, number, number] },
    // 4.0 split-tone (0 = off, the 3.7 grade): shadows lifted toward uTeal, highlights pushed toward
    // uWarm. Works on linear HDR before tone mapping (OutputPass applies ACES after this pass).
    uSplit: { value: 0 },
    uTeal: { value: [0.0, 0.016, 0.026] as [number, number, number] },
    uWarm: { value: [1.12, 0.97, 0.84] as [number, number, number] },
    uSplitSat: { value: 1.0 },
    // 4.2 shadow hue: the darks multiplied toward this colour (1,1,1 = off) below uLo luminance.
    uShadowMul: { value: [1, 1, 1] as [number, number, number] },
    uLo: { value: 0.14 },
    // 4.1 bleach bypass (all 0 = off): desaturate the midtones, crush the darkest values, and a
    // silver-retention contrast push around mid-grey.
    uDesat: { value: 0 },
    uCrush: { value: 0 },
    uContrast: { value: 0 },
    /** Luminance range of the split-tone's highlight mask (Tokyo's night: 0.22..1.6). */
    uHi: { value: new THREE.Vector2(0.22, 1.6) },
    // 4.1 heat haze (uHazePx = 0: off). See Renderer.haze.
    uHazePx: { value: 0 },
    uHorizon: { value: 0.5 },
    uBand: { value: 0.12 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGunMin: { value: new THREE.Vector2(2, 2) },
    uGunMax: { value: new THREE.Vector2(2, 2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uDamage, uAberration, uFade, uLetterbox, uAspect, uFlash;
    uniform vec3 uShadowTint, uTeal, uWarm, uShadowMul;
    uniform float uSplit, uSplitSat, uLo, uDesat, uCrush, uContrast;
    uniform vec2 uHi;
    uniform float uHazePx, uHorizon, uBand;
    uniform vec2 uRes, uGunMin, uGunMax;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // Heat haze (4.1, desert): a shimmer in a band round the horizon (the far, hot ground and the
      // mesas), two interfering ripples rising with time, at most a pixel or two; the gun's box on
      // screen is left alone. Folded into this pass's existing fetches: no extra pass.
      vec2 uv = vUv;
      if (uHazePx > 0.0) {
        float d = vUv.y - uHorizon;
        float m = smoothstep(-uBand, -uBand * 0.2, d) * (1.0 - smoothstep(0.0, uBand * 0.3, d));
        vec2 gun = smoothstep(uGunMin - 0.02, uGunMin, vUv) * (1.0 - smoothstep(uGunMax, uGunMax + 0.02, vUv));
        m *= 1.0 - gun.x * gun.y;
        vec2 px = vUv * uRes;
        float w = sin(px.y * 0.21 - uTime * 7.0 + sin(px.x * 0.013 + uTime * 0.9) * 2.0) * 0.6
                + sin(px.y * 0.083 + px.x * 0.007 - uTime * 4.3) * 0.4;
        uv += vec2(w, w * 0.4) * uHazePx * m / uRes;
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      // Radial chromatic aberration, stronger at the edges and when hurt.
      float ab = uAberration * (0.4 + r2 * 3.0) + uDamage * 0.006;
      vec2 dir = c * ab;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;

      // Grade: cool shadows, slightly warm highlights, gentle contrast in log-ish space.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += uShadowTint * (1.0 - smoothstep(0.0, 0.25, lum));
      col = mix(col, col * vec3(1.04, 0.99, 0.95), smoothstep(0.4, 1.5, lum));
      col = mix(vec3(lum), col, 1.08);

      // Bleach bypass (4.1, desert): silver left in the print raises contrast and drains colour from
      // the midtones; the deepest shadows go to near black. Linear HDR, so the masks are in scene
      // luminance (mid-grey 0.18).
      if (uDesat + uCrush + uContrast > 0.0) {
        float l3 = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
        float mid = smoothstep(0.015, 0.1, l3) * (1.0 - smoothstep(0.9, 3.5, l3));
        col = mix(col, vec3(l3), uDesat * mid);
        col *= pow(l3 / 0.18, uContrast);
        col *= mix(1.0, 0.3 + 0.7 * smoothstep(0.0, 0.05, l3), uCrush);
      }

      // Teal and orange (4.0): cool lift in the darks, warm push in the highlights, a little extra
      // saturation in the brights so neon keeps its hue after the warm push. Off (uSplit = 0) in 3.7.
      if (uSplit > 0.0) {
        float sh = 1.0 - smoothstep(0.0, uLo, lum);
        float hi = smoothstep(uHi.x, uHi.y, lum);
        // 4.2: re-hue the darks multiplicatively (keeps them dark; the additive lift only shows in
        // near-black).
        col *= mix(vec3(1.0), uShadowMul, sh * uSplit);
        col += uTeal * sh * uSplit;
        col *= mix(vec3(1.0), uWarm, hi * uSplit);
        float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l2), col, mix(1.0, uSplitSat, hi * uSplit));
      }


      // Vignette.
      float vig = (1.0 - smoothstep(0.25, 1.05, sqrt(r2) * 1.15));
      col *= mix(0.55, 1.0, vig);

      // Damage: red edge pulse.
      float edge = smoothstep(0.15, 0.75, sqrt(r2));
      col = mix(col, col * 0.4 + vec3(0.55, 0.02, 0.04) * edge, uDamage * edge * 0.85);
      col += vec3(1.0, 0.85, 0.7) * uFlash * 0.04;

      // Film grain.
      float g = hash(vUv * vec2(1931.0, 977.0) + fract(uTime * 7.13)) - 0.5;
      col += g * 0.035 * (0.35 + lum);

      col *= 1.0 - uFade;
      // Letterbox.
      float lb = uLetterbox * 0.12;
      if (vUv.y < lb || vUv.y > 1.0 - lb) col = vec3(0.0);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/** Post pipeline: the 4.0 look, the 3.7 look (same passes, old parameters), or no composer at all. */
export type Pipeline = 'v4' | 'v37' | 'raw';

export interface LookGrade {
  /** 0..1 strength of the teal/orange split. */
  split: number;
  teal: [number, number, number];
  warm: [number, number, number];
  /** Saturation multiplier in the highlights. */
  sat: number;
  /** 4.1 bleach bypass: midtone desaturation (0..1), shadow crush (0..1), contrast exponent (~0.1). */
  desat?: number;
  crush?: number;
  contrast?: number;
  /** Highlight mask range for the warm push (default 0.22..1.6, a night scene). */
  hi?: [number, number];
  /** 4.2: multiplicative hue of the darks (default 1,1,1) and the luminance where they end (default 0.14). */
  shadow?: [number, number, number];
  lo?: number;
}

type Look = { exposure: number; bloom: { strength: number; radius: number; threshold: number }; shadows: boolean; shadowTint: [number, number, number]; grade?: LookGrade; legacy?: Look };

export class Renderer {
  /** DEV comparison switch (F8): what the next frames are drawn with. */
  pipeline: Pipeline = 'v4';
  private look: Look | null = null;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  private scenePass: RenderPass;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  weaponPass: RenderPass;
  /**
   * Heat haze (4.1): peak offset in pixels (0 = off) and the horizon's screen y (0 bottom, 1 top),
   * set by the level each frame. Applied in the grade pass, outside the viewmodel's screen box.
   */
  haze = { px: 0, horizon: 0.5 };
  private _box = new THREE.Box3();
  private _c = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    public scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
    public weaponScene: THREE.Scene,
    public weaponCamera: THREE.PerspectiveCamera,
  ) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    // Count draw calls over the whole composer frame, not just its last pass.
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    this.renderer = r;

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(r);
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);

    this.weaponPass = new RenderPass(weaponScene, weaponCamera);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.composer.addPass(this.weaponPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.85, 0.65, 0.92);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** A level switch draws a new scene. */
  setScene(scene: THREE.Scene) {
    this.scene = scene;
    this.scenePass.scene = scene;
  }

  /** The loaded level's look: exposure, bloom, sun shadows, grade tint. */
  setLook(look: Look) {
    this.look = look;
    // The 3.7 comparison uses the level's legacy parameters if it has them (only Tokyo changed in 4.0).
    const l = this.pipeline === 'v37' && look.legacy ? look.legacy : look;
    const r = this.renderer;
    r.toneMappingExposure = l.exposure;
    this.bloom.strength = l.bloom.strength;
    this.bloom.radius = l.bloom.radius;
    this.bloom.threshold = l.bloom.threshold;
    r.shadowMap.enabled = l.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.grade.uniforms.uShadowTint.value = l.shadowTint;
    const gr = l.grade;
    const u = this.grade.uniforms;
    u.uSplit.value = gr ? gr.split : 0;
    u.uDesat.value = gr?.desat ?? 0;
    u.uCrush.value = gr?.crush ?? 0;
    u.uContrast.value = gr?.contrast ?? 0;
    u.uHi.value.set(...(gr?.hi ?? [0.22, 1.6]));
    u.uShadowMul.value = gr?.shadow ?? [1, 1, 1];
    u.uLo.value = gr?.lo ?? 0.14;
    if (gr) {
      u.uTeal.value = gr.teal;
      u.uWarm.value = gr.warm;
      u.uSplitSat.value = gr.sat;
    }
  }

  /** Switch the post pipeline (re-applies the level's look for the chosen version). */
  setPipeline(p: Pipeline) {
    this.pipeline = p;
    if (this.look) this.setLook(this.look);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  /** Highest pixel ratio we render at (set by the graphics preset, never above the display's). */
  maxPixelRatio = Math.min(window.devicePixelRatio, 1.25);
  /** Lowest the adaptive resolution may go. */
  get minPixelRatio() {
    return Math.min(this.maxPixelRatio, 0.75);
  }

  /**
   * 17.0: a temporary resolution ceiling under the preset's (the menu's stage draws at 1.0: a dark,
   * bloomed backdrop behind HTML text, and it is fill-bound: 5.1 → 3.3 ms of GPU a frame at 1.25 →
   * 1.0 on Apple M5).
   */
  ceiling = Infinity;
  /** The highest resolution allowed now: the preset's, under any temporary ceiling. */
  get allowedPixelRatio() {
    return Math.min(this.maxPixelRatio, this.ceiling);
  }

  /** Sets (Infinity: lifts) the temporary ceiling and applies it at once. */
  setCeiling(pr: number) {
    this.ceiling = pr;
    this.renderer.setPixelRatio(this.allowedPixelRatio);
    this.resize();
  }

  /** Adaptive resolution: lowered when the frame rate sags, restored when there's headroom. */
  setPixelRatio(pr: number) {
    const v = Math.max(Math.min(this.minPixelRatio, this.allowedPixelRatio), Math.min(this.allowedPixelRatio, pr));
    if (Math.abs(v - this.renderer.getPixelRatio()) < 0.01) return;
    this.renderer.setPixelRatio(v);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    this.grade.uniforms.uAspect.value = w / h;
    this.grade.uniforms.uRes.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  /** 3 or 5 blur levels; with 3 the remaining levels are weighted up a little to keep the glow. */
  setBloomLevels(n: 3 | 5) {
    const u = this.bloom.compositeMaterial.uniforms.bloomFactors;
    this.bloom.nMips = n;
    u.value = n === 5 ? [1, 0.8, 0.6, 0.4, 0.2] : [1.1, 1.0, 0.95, 0, 0];
  }

  /** Haze uniforms, with the viewmodel's projected screen box as the exclusion. */
  private updateHaze() {
    const u = this.grade.uniforms;
    u.uHazePx.value = this.haze.px;
    if (this.haze.px <= 0) return;
    u.uHorizon.value = this.haze.horizon;
    const b = this._box.makeEmpty();
    this.weaponScene.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) b.expandByObject(o);
    });
    const min = u.uGunMin.value as THREE.Vector2, max = u.uGunMax.value as THREE.Vector2;
    if (b.isEmpty()) {
      min.set(2, 2);
      max.set(2, 2);
      return;
    }
    min.set(1, 1);
    max.set(0, 0);
    const cam = this.weaponCamera;
    for (let i = 0; i < 8; i++) {
      // Into view space; a corner behind the camera (the arms reach past it) would project mirrored,
      // so pull it just in front of it first.
      this._c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(cam.matrixWorldInverse);
      this._c.z = Math.min(this._c.z, -0.05);
      this._c.applyMatrix4(cam.projectionMatrix);
      const x = THREE.MathUtils.clamp((this._c.x + 1) / 2, 0, 1), y = THREE.MathUtils.clamp((this._c.y + 1) / 2, 0, 1);
      min.set(Math.min(min.x, x), Math.min(min.y, y));
      max.set(Math.max(max.x, x), Math.max(max.y, y));
    }
  }

  render(time: number) {
    const r = this.renderer;
    r.info.reset();
    if (this.pipeline === 'raw') {
      // No composer: the world straight to the canvas (ACES and sRGB applied by the renderer), then
      // the viewmodel over it. No bloom, grade, vignette, grain, fades or letterbox.
      r.setRenderTarget(null);
      r.autoClear = false;
      r.clear();
      r.render(this.scene, this.camera);
      r.clearDepth();
      if (this.weaponPass.enabled) r.render(this.weaponScene, this.weaponCamera);
      r.autoClear = true;
      return;
    }
    this.grade.uniforms.uTime.value = time;
    this.updateHaze();
    this.composer.render();
  }
}
