import * as THREE from 'three';

/*
  Favelas' dust motes (40.0): specks drifting in the sun round the viewer. One InstancedBufferGeometry
  of camera-facing quads (one draw call); every position is computed in the vertex shader from a seed,
  the time and the camera (wrapped in a box round it), so the CPU sets four uniforms a frame and
  nothing else. Additive, no depth write, no shadow, no fog. They catch the light: brighter the more a
  speck lies between the eye and the sun.
*/

const COUNT = 900;
const BOX = new THREE.Vector3(36, 12, 36);

export class Dust {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(COUNT * 4);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT * 4; i++) seeds[i] = rnd();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = COUNT;
    quad.dispose();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: BOX.clone() },
        uSun: { value: sunDir.clone().normalize() },
        uColor: { value: new THREE.Color(1.0, 0.9, 0.72) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCam, uBox, uSun;
        varying float vA;
        varying vec2 vUv;
        void main() {
          vec3 origin = uCam - uBox * 0.5 + vec3(0.0, uBox.y * 0.3, 0.0);
          // A slow breeze from the sea (west), each speck at its own pace, bobbing.
          vec3 drift = vec3(0.35 + aSeed.w * 0.3, 0.04 * sin(uTime * 0.7 + aSeed.x * 40.0), 0.12 * sin(uTime * 0.23 + aSeed.z * 9.0));
          vec3 p = mod(aSeed.xyz * uBox + drift * uTime - origin, uBox) + origin;
          p.y += 0.25 * sin(uTime * (0.5 + aSeed.w) + aSeed.y * 30.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float size = 0.018 + aSeed.w * 0.03;
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float d = -mv.z;
          // Lit against the sun (forward scatter), faded in near the eye and out at the box's edge.
          vec3 toP = normalize(p - uCam);
          float scatter = 0.35 + 1.4 * pow(max(dot(toP, uSun), 0.0), 3.0);
          vA = scatter * smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(10.0, 17.0, d)) * (0.5 + 0.5 * sin(uTime * 1.3 + aSeed.x * 60.0));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = vA * (1.0 - smoothstep(0.2, 1.0, r)) * 0.55;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.soft = true;
    this.mesh.raycast = () => {};
    this.mesh.name = 'dust';
    scene.add(this.mesh);
  }

  update(time: number, cam: THREE.Camera) {
    this.mat.uniforms.uTime.value = time;
    (this.mat.uniforms.uCam.value as THREE.Vector3).copy(cam.position);
  }
}
