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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uDamage, uAberration, uFade, uLetterbox, uAspect, uFlash;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      // Radial chromatic aberration, stronger at the edges and when hurt.
      float ab = uAberration * (0.4 + r2 * 3.0) + uDamage * 0.006;
      vec2 dir = c * ab;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;

      // Grade: cool shadows, slightly warm highlights, gentle contrast in log-ish space.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.012, 0.010, 0.030);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.25, lum));
      col = mix(col, col * vec3(1.04, 0.99, 0.95), smoothstep(0.4, 1.5, lum));
      col = mix(vec3(lum), col, 1.08);

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

export class Renderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  weaponPass: RenderPass;

  constructor(
    container: HTMLElement,
    public scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
    public weaponScene: THREE.Scene,
    public weaponCamera: THREE.PerspectiveCamera,
  ) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, camera));

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

  get canvas() {
    return this.renderer.domElement;
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
  }

  render(time: number) {
    this.grade.uniforms.uTime.value = time;
    this.composer.render();
  }
}
