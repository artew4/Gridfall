import * as THREE from 'three';
import type { BuildCtx } from './City';
import { GLOW_GLSL, type Glow } from './Glows';
import { WET_NOISE_GLSL } from './Ground';
import { signTexture } from './Textures';

const BASIN_R = 4.2;
const WATER_Y = 0.52;
const JETS = 12;
const DROPS = 44;

/** Colour cycle: cyan → magenta → violet → cyan. */
const PALETTE = [new THREE.Color(0.2, 0.95, 1.0), new THREE.Color(1.0, 0.25, 0.85), new THREE.Color(0.55, 0.3, 1.0)];

/**
 * Centrepiece of the plaza: a dark stone basin (full-height cover from the column, low cover from the
 * rim), arcing GPU jets, a water curtain from the upper bowl, slow holographic rings and one real
 * light that cycles colour. The water reflects the baked neon and brightens with lightning and trains.
 */
export class Fountain {
  light: THREE.PointLight;
  glow: Glow;
  color = new THREE.Color();
  uniforms: Record<string, THREE.IUniform>;
  private rings: THREE.Mesh[] = [];
  private ringMat: THREE.MeshBasicMaterial[] = [];
  private led: THREE.MeshBasicMaterial;
  private textMat: THREE.MeshBasicMaterial;

  constructor(ctx: BuildCtx, glows: { uniforms: Record<string, THREE.IUniform> }) {
    const { scene, col, builder: b } = ctx;
    this.uniforms = {
      uTime: ctx.time,
      uColor: { value: new THREE.Color() },
      uBoost: { value: 0 },
      uFogDensity: { value: ctx.fog.density },
      ...glows.uniforms,
    };

    // ---- Stone basin (lathe profile: outer wall, rounded lip, inner wall, floor).
    const stone = new THREE.MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.22, metalness: 0.15, envMapIntensity: 1.5 });
    const prof = [
      [BASIN_R + 0.15, 0],
      [BASIN_R, 0.08],
      [BASIN_R, 0.62],
      [BASIN_R - 0.08, 0.72],
      [BASIN_R - 0.42, 0.72],
      [BASIN_R - 0.5, 0.64],
      [BASIN_R - 0.5, 0.2],
      [1.2, 0.16],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(prof, 64), stone);
    // Column, upper bowl, finial.
    b.add(new THREE.CylinderGeometry(0.95, 1.15, 2.6, 24), stone, 0, 1.3, 0);
    const bowl = [
      [0.9, 2.5],
      [2.3, 2.85],
      [2.35, 3.0],
      [2.15, 3.02],
      [0.6, 2.75],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(bowl, 48), stone);
    b.add(new THREE.CylinderGeometry(0.25, 0.4, 1.2, 16), stone, 0, 3.55, 0);
    col.addCylinder(0, 0, BASIN_R, 0, 0.72, 'concrete');
    col.addCylinder(0, 0, 1.15, 0, 3.0, 'concrete');
    col.addCylinder(0, 0, 2.35, 2.5, 3.05, 'concrete').solid = false;

    // ---- LED strip under the lip and vertical lettering on the column.
    this.led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 2.4) });
    const strip = new THREE.Mesh(new THREE.TorusGeometry(BASIN_R + 0.02, 0.025, 6, 96), this.led);
    strip.rotation.x = Math.PI / 2;
    strip.position.y = 0.6;
    scene.add(strip);
    const tex = signTexture({ text: '噴水広場', vertical: true, color: '#7ff6ff', style: 'neon' });
    this.textMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const aspect = tex.userData.aspect as number;
    const th = 1.9;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(th * aspect, th), this.textMat);
      p.position.set(Math.sin(a) * 1.08, 1.35, Math.cos(a) * 1.08);
      p.rotation.y = a;
      scene.add(p);
    }

    // ---- Water surface: mirror-like standard material with ripples and caustic shimmer.
    const water = new THREE.MeshStandardMaterial({ color: 0x03080c, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.8, emissive: 0xffffff, emissiveIntensity: 1 });
    water.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: this.uniforms.uTime, uColor: this.uniforms.uColor, uBoost: this.uniforms.uBoost });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWp;
          uniform float uTime, uBoost;
          uniform vec3 uColor;
          ${WET_NOISE_GLSL}
          vec2 jetRipples(vec2 p) {
            vec2 acc = vec2(0.0);
            for (int i = 0; i < ${JETS}; i++) {
              float a = float(i) * ${((Math.PI * 2) / JETS).toFixed(5)};
              vec2 c = vec2(cos(a), sin(a)) * 1.65;
              vec2 d = p - c;
              float r = length(d);
              float w = sin(r * 22.0 - uTime * 9.0 + float(i)) * exp(-r * 2.2);
              acc += d / max(r, 1e-3) * w;
            }
            return acc;
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 rip = jetRipples(vWp.xz) * 0.09;
            float n1 = wNoise(vWp.xz * 2.5 + vec2(uTime * 0.6, 0.0));
            float n2 = wNoise(vWp.xz * 2.5 + vec2(0.0, uTime * 0.5) + 7.0);
            rip += (vec2(n1, n2) - 0.5) * 0.25;
            normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Caustic web lit from the LED ring; flares with lightning or a passing train.
            vec2 q = vWp.xz * 1.6;
            float c1 = wNoise(q + vec2(uTime * 0.35, uTime * 0.2));
            float c2 = wNoise(q * 1.7 - vec2(uTime * 0.25, -uTime * 0.3) + 3.0);
            float caustic = pow(1.0 - abs(c1 - c2), 8.0);
            float edge = smoothstep(2.6, ${(BASIN_R - 0.5).toFixed(2)}, length(vWp.xz));
            totalEmissiveRadiance = uColor * (0.04 + caustic * 0.35 + edge * 0.18) * (1.0 + uBoost * 2.5);
          }`,
        );
    };
    water.customProgramCacheKey = () => 'fountain-water';
    const surf = new THREE.Mesh(new THREE.RingGeometry(1.0, BASIN_R - 0.48, 64, 1), water);
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = WATER_Y;
    scene.add(surf);
    const upper = new THREE.Mesh(new THREE.CircleGeometry(2.12, 40), water);
    upper.rotation.x = -Math.PI / 2;
    upper.position.y = 2.96;
    scene.add(upper);

    // ---- Curtain falling from the upper bowl.
    const curtain = new THREE.Mesh(
      new THREE.CylinderGeometry(2.32, 2.0, 2.4, 48, 1, true),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vW;
          varying float vDist;
          void main() {
            vUv = uv;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vec4 mv = viewMatrix * w;
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uBoost, uFogDensity;
          uniform vec3 uColor;
          varying vec2 vUv;
          varying vec3 vW;
          varying float vDist;
          ${WET_NOISE_GLSL}
          ${GLOW_GLSL}
          void main() {
            float x = vUv.x * 90.0;
            float streak = wNoise(vec2(x, vUv.y * 3.0 + uTime * 2.6));
            streak = smoothstep(0.45, 0.9, streak) * (0.4 + 0.6 * wNoise(vec2(x * 0.3, uTime)));
            float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
            vec3 col = (uColor * 0.5 + glowLight(vW) * 0.6 + 0.05) * (1.0 + uBoost * 2.0);
            float fogF = exp(-uFogDensity * uFogDensity * vDist * vDist);
            gl_FragColor = vec4(col * streak * fade * 0.55 * fogF, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    curtain.position.y = 1.7;
    curtain.renderOrder = 4;
    scene.add(curtain);

    // ---- Jets: droplets streaming along parabolas from the rim towards the column (one draw call).
    scene.add(this.buildJets());

    // ---- Holographic rings.
    const tints = [new THREE.Color(0.2, 1.4, 1.6), new THREE.Color(1.4, 0.3, 1.2), new THREE.Color(0.7, 0.5, 1.6)];
    [2.0, 2.6, 3.2].forEach((r, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: tints[i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 96), mat);
      ring.position.y = 5.2 + i * 0.45;
      scene.add(ring);
      this.rings.push(ring);
      this.ringMat.push(mat);
      // Tick marks around each ring make the rotation readable.
      const ticks = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 2, 24), mat);
      ticks.scale.set(1, 1, 0.12);
      ring.add(ticks);
    });

    // ---- The one real light (colour cycles), plus a glow for particle/halo lighting.
    this.light = new THREE.PointLight(0x40e0ff, 22, 16, 2);
    this.light.position.set(0, 3.8, 0);
    scene.add(this.light);
    this.glow = ctx.glows.add({ pos: new THREE.Vector3(0, 2.2, 0), color: new THREE.Color(0.3, 0.9, 1.0), radius: 8, base: 1.0, haloSize: 7, haloStrength: 0.1, mode: 'steady' });
  }

  private buildJets() {
    const count = JETS * DROPS;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const j = Math.floor(i / DROPS);
      seed.set([(j / JETS) * Math.PI * 2, (i % DROPS) / DROPS + Math.random() * 0.02, Math.random()], i * 3);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uBoost, uFogDensity;
        uniform vec3 uColor;
        varying vec3 vCol;
        varying vec2 vUv;
        varying float vA;
        ${GLOW_GLSL}
        void main() {
          float ph = fract(uTime * 0.8 + aSeed.y);
          float ang = aSeed.x + (aSeed.z - 0.5) * 0.03;
          vec2 dir = vec2(cos(ang), sin(ang));
          // Rim nozzle at r 3.55 arcing inwards to r 1.65, apex ~2.3m.
          float r = mix(3.55, 1.65, ph);
          float y = 0.62 + ph * 0.05 + 4.0 * 1.75 * ph * (1.0 - ph);
          vec3 p = vec3(dir.x * r, y, dir.y * r);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float s = 0.045 + aSeed.z * 0.03;
          mv.xy += position.xy * vec2(s, s * 2.2);
          vUv = uv;
          float dist = -mv.z;
          vA = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.92, 1.0, ph)) * exp(-uFogDensity * uFogDensity * dist * dist);
          vCol = (uColor * 0.8 + glowLight(p) * 0.8 + 0.08) * (1.0 + uBoost * 2.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float d = length((vUv - 0.5) * vec2(2.0, 1.0));
          float a = (1.0 - smoothstep(0.2, 0.5, d)) * vA;
          gl_FragColor = vec4(vCol * a * 1.4, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  /** `boost` 0..1 brightens the water (lightning, train light). */
  update(t: number, boost: number) {
    const k = (t * 0.06) % 1;
    const seg = k * PALETTE.length;
    const i = Math.floor(seg);
    this.color.copy(PALETTE[i]).lerp(PALETTE[(i + 1) % PALETTE.length], THREE.MathUtils.smoothstep(seg - i, 0, 1));
    (this.uniforms.uColor.value as THREE.Color).copy(this.color);
    this.uniforms.uBoost.value = boost;
    this.light.color.copy(this.color);
    this.light.intensity = 22 * (1 + boost * 0.6);
    this.glow.color.copy(this.color);
    this.led.color.copy(this.color).multiplyScalar(2.4);
    this.rings.forEach((r, n) => {
      r.rotation.set(Math.PI / 2 + Math.sin(t * 0.3 + n) * 0.25, t * (0.2 + n * 0.12) * (n % 2 ? -1 : 1), Math.cos(t * 0.23 + n * 2) * 0.2);
      r.position.y = 5.2 + n * 0.45 + Math.sin(t * 0.8 + n) * 0.08;
      this.ringMat[n].opacity = 0.6 + 0.25 * Math.sin(t * 2.3 + n * 1.7) + (Math.random() < 0.01 ? -0.5 : 0);
    });
    this.textMat.color.setScalar(2.0 + Math.sin(t * 3.1) * 0.15);
  }
}
