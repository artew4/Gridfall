import * as THREE from 'three';
import { rand } from '../core/math';
import type { Surface } from '../world/Collision';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; g: number; b: number; a: number;
  size: number; grow: number; stretch: number;
  life: number; max: number;
  drag: number; gravity: number; bounce: number;
}

/** CPU-simulated, GPU-instanced particle pool. One draw call per blend mode. */
export class Particles {
  private pool: P[] = [];
  private alive = 0;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, private capacity: number, additive: boolean, fog: THREE.FogExp2) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, a: 1, size: 0.1, grow: 0, stretch: 0, life: 0, max: 1, drag: 0, gravity: 0, bounce: 0 });
    }
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(3);
    this.aVel = mk(3);
    this.aCol = mk(4);
    this.aSize = mk(2);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uFogDensity: { value: fog.density } },
      vertexShader: /* glsl */ `
        attribute vec3 aPos;
        attribute vec3 aVel;
        attribute vec4 aCol;
        attribute vec2 aSize;
        uniform float uFogDensity;
        varying vec4 vCol;
        varying vec2 vUv;
        void main() {
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float size = aSize.x;
          if (aSize.y > 0.0) {
            vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz;
            // Project velocity direction to screen-ish plane.
            vec2 d = vv.xy;
            float l = length(d);
            vec2 axis = l > 1e-4 ? d / l : vec2(0.0, 1.0);
            vec2 perp = vec2(-axis.y, axis.x);
            float len = l * aSize.y + size;
            mv.xy += axis * (position.y - 0.5) * len + perp * position.x * size;
          } else {
            mv.xy += position.xy * size;
          }
          vUv = uv;
          float dist = -mv.z;
          float f = uFogDensity * dist;
          vCol = vec4(aCol.rgb, aCol.a * exp(-f * f * 0.6));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec4 vCol;
        varying vec2 vUv;
        void main() {
          vec2 c = (vUv - 0.5) * 2.0;
          float a = clamp(1.0 - dot(c, c), 0.0, 1.0);
          a *= a;
          ${additive ? 'gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);' : 'gl_FragColor = vec4(vCol.rgb, a * vCol.a);'}
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 9 : 8;
    scene.add(this.mesh);
  }

  spawn(o: Partial<P> & { x: number; y: number; z: number }) {
    if (this.alive >= this.capacity) return;
    const p = this.pool[this.alive++];
    p.vx = p.vy = p.vz = 0;
    p.r = p.g = p.b = p.a = 1;
    p.size = 0.05;
    p.grow = 0;
    p.stretch = 0;
    p.life = p.max = 0.5;
    p.drag = 0;
    p.gravity = 0;
    p.bounce = 0;
    Object.assign(p, o);
    if (o.life !== undefined) p.max = o.life;
  }

  clear() {
    this.alive = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number) {
    const pool = this.pool;
    let i = 0;
    while (i < this.alive) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-remove.
        this.alive--;
        pool[i] = pool[this.alive];
        pool[this.alive] = p;
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k - p.gravity * dt;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.bounce > 0 && p.y < 0.02) {
        p.y = 0.02;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.size += p.grow * dt;
      const t = p.life / p.max;
      this.aPos.setXYZ(i, p.x, p.y, p.z);
      this.aVel.setXYZ(i, p.vx, p.vy, p.vz);
      this.aCol.setXYZW(i, p.r, p.g, p.b, p.a * t);
      this.aSize.setXY(i, p.size, p.stretch);
      i++;
    }
    this.geo.instanceCount = this.alive;
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

interface Shell {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  bounces: number;
}

/** Combat visual effects: sparks, tracers, impact smoke, ejected shells, scorch decals. */
export class Effects {
  add: Particles;
  smoke: Particles;
  private shells: Shell[] = [];
  private shellMesh: THREE.InstancedMesh;
  private decals: THREE.InstancedMesh;
  private decalLife: number[] = [];
  private decalIdx = 0;
  private dummy = new THREE.Object3D();
  onShellBounce: (pos: THREE.Vector3, strength: number) => void = () => {};

  constructor(scene: THREE.Scene, fog: THREE.FogExp2) {
    this.add = new Particles(scene, 900, true, fog);
    this.smoke = new Particles(scene, 300, false, fog);

    const shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6);
    shellGeo.rotateZ(Math.PI / 2);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, metalness: 1, roughness: 0.25, envMapIntensity: 1.5 });
    this.shellMesh = new THREE.InstancedMesh(shellGeo, brass, 32);
    this.shellMesh.count = 0;
    this.shellMesh.frustumCulled = false;
    scene.add(this.shellMesh);

    // Scorch decals: dark burn with a hot rim that cools.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.35, 'rgba(10,8,8,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    const decalMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0x000000 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), decalMat, 48);
    this.decals.frustumCulled = false;
    for (let i = 0; i < 48; i++) {
      this.decalLife.push(0);
      this.dummy.position.set(0, -100, 0);
      this.dummy.updateMatrix();
      this.decals.setMatrixAt(i, this.dummy.matrix);
    }
    scene.add(this.decals);
  }

  clear() {
    this.add.clear();
    this.smoke.clear();
    this.shells.length = 0;
  }

  /** Bright stretched sparks; metal gets a lot more of them. */
  sparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number, color = new THREE.Color(1.0, 0.65, 0.25), speed = 6) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(0.7).add(normal).normalize().multiplyScalar(speed * rand(0.3, 1.3));
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: v.x, vy: v.y + 1, vz: v.z,
        r: color.r * 4, g: color.g * 4, b: color.b * 4,
        size: rand(0.012, 0.025), stretch: 0.02,
        life: rand(0.2, 0.6), gravity: 9, drag: 1.5, bounce: 0.35,
      });
    }
  }

  impact(pos: THREE.Vector3, normal: THREE.Vector3, surface: Surface) {
    // Flash at the hit point.
    this.add.spawn({ x: pos.x + normal.x * 0.05, y: pos.y + normal.y * 0.05, z: pos.z + normal.z * 0.05, r: 3, g: 2.2, b: 1.2, size: 0.35, life: 0.06 });
    if (surface === 'metal') {
      this.sparks(pos, normal, 16, undefined, 8);
    } else if (surface === 'flesh') {
      return;
    } else {
      this.sparks(pos, normal, 5, undefined, 4);
      // Dust / water puff.
      for (let i = 0; i < 4; i++) {
        this.smoke.spawn({
          x: pos.x, y: pos.y, z: pos.z,
          vx: normal.x * rand(0.5, 1.5) + rand(-0.3, 0.3), vy: normal.y * rand(0.5, 1.5) + rand(0, 0.4), vz: normal.z * rand(0.5, 1.5) + rand(-0.3, 0.3),
          r: 0.32, g: 0.32, b: 0.38, a: 0.35, size: 0.12, grow: 0.9, life: rand(0.5, 0.9), drag: 3,
        });
      }
      if (normal.y > 0.5) {
        // Hit the wet street: water spray.
        for (let i = 0; i < 10; i++) {
          this.add.spawn({
            x: pos.x, y: pos.y + 0.02, z: pos.z,
            vx: rand(-1, 1), vy: rand(2, 4), vz: rand(-1, 1),
            r: 0.4, g: 0.45, b: 0.6, size: 0.012, stretch: 0.03, life: rand(0.3, 0.5), gravity: 12,
          });
        }
      }
    }
    // Ember that cools on the surface.
    this.add.spawn({ x: pos.x + normal.x * 0.01, y: pos.y + normal.y * 0.01, z: pos.z + normal.z * 0.01, r: 2.5, g: 0.9, b: 0.2, size: 0.05, life: 1.2 });
    this.decal(pos, normal);
  }

  /** Enemy hit: electric blue-white sparks and dark coolant spray (they are not entirely human). */
  enemyHit(pos: THREE.Vector3, dir: THREE.Vector3, accent: THREE.Color) {
    const n = dir.clone().negate();
    this.sparks(pos, n, 10, new THREE.Color(0.6, 0.85, 1.0), 5);
    this.sparks(pos, dir, 6, accent, 4);
    for (let i = 0; i < 8; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * rand(1, 3) + rand(-1, 1), vy: rand(0, 2), vz: dir.z * rand(1, 3) + rand(-1, 1),
        r: 0.02, g: 0.03, b: 0.04, a: 0.9, size: rand(0.03, 0.06), life: rand(0.3, 0.6), gravity: 9, bounce: 0.1,
      });
    }
    this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, r: accent.r * 3, g: accent.g * 3, b: accent.b * 3, size: 0.5, life: 0.08 });
  }

  deathBurst(pos: THREE.Vector3, accent: THREE.Color) {
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7));
      const c = Math.random() < 0.5 ? accent : new THREE.Color(0.7, 0.9, 1);
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z,
        r: c.r * 3, g: c.g * 3, b: c.b * 3, size: rand(0.015, 0.03), stretch: 0.025,
        life: rand(0.4, 1.0), gravity: 8, drag: 1, bounce: 0.3,
      });
    }
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn({
        x: pos.x + rand(-0.3, 0.3), y: pos.y + rand(-0.4, 0.4), z: pos.z + rand(-0.3, 0.3),
        vx: rand(-0.4, 0.4), vy: rand(0.3, 1.0), vz: rand(-0.4, 0.4),
        r: 0.15, g: 0.15, b: 0.2, a: 0.4, size: 0.3, grow: 1.2, life: rand(0.8, 1.5), drag: 1,
      });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = new THREE.Color(1.0, 0.75, 0.4)) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 1.5) return;
    const speed = 280;
    d.divideScalar(len).multiplyScalar(speed);
    this.add.spawn({
      x: from.x, y: from.y, z: from.z, vx: d.x, vy: d.y, vz: d.z,
      r: color.r * 3, g: color.g * 3, b: color.b * 3, size: 0.018, stretch: 0.012, life: Math.min(len / speed, 0.25),
    });
  }

  muzzleSmoke(pos: THREE.Vector3, dir: THREE.Vector3) {
    for (let i = 0; i < 2; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * rand(0.5, 1.2), vy: rand(0.2, 0.6), vz: dir.z * rand(0.5, 1.2),
        r: 0.5, g: 0.5, b: 0.55, a: 0.12, size: 0.06, grow: 0.5, life: rand(0.5, 0.9), drag: 2,
      });
    }
  }

  ejectShell(pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    if (this.shells.length >= 32) this.shells.shift();
    const vel = right.clone().multiplyScalar(rand(1.8, 2.6)).addScaledVector(up, rand(1.6, 2.4));
    this.shells.push({
      pos: pos.clone(),
      vel,
      rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
      spin: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
      life: 6,
      bounces: 0,
    });
  }

  private decal(pos: THREE.Vector3, normal: THREE.Vector3) {
    const i = this.decalIdx;
    this.decalIdx = (this.decalIdx + 1) % 48;
    this.dummy.position.copy(pos).addScaledVector(normal, 0.01);
    this.dummy.lookAt(pos.clone().add(normal));
    this.dummy.rotateZ(rand(0, 6.28));
    const s = rand(0.7, 1.3);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.decals.setMatrixAt(i, this.dummy.matrix);
    this.decals.instanceMatrix.needsUpdate = true;
    this.decalLife[i] = 1;
  }

  update(dt: number) {
    this.add.update(dt);
    this.smoke.update(dt);
    let n = 0;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shells.splice(i, 1);
        continue;
      }
      if (s.bounces < 4) {
        s.vel.y -= 9.8 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.rot.x += s.spin.x * dt;
        s.rot.y += s.spin.y * dt;
        s.rot.z += s.spin.z * dt;
        if (s.pos.y < 0.01) {
          s.pos.y = 0.01;
          const strength = Math.min(1, Math.abs(s.vel.y) / 3);
          s.vel.y = Math.abs(s.vel.y) * 0.35;
          s.vel.x *= 0.5;
          s.vel.z *= 0.5;
          s.spin.multiplyScalar(0.5);
          s.bounces++;
          if (strength > 0.1) this.onShellBounce(s.pos, strength);
          if (s.bounces >= 4) s.rot.set(0, s.rot.y, 0);
        }
      }
    }
    for (const s of this.shells) {
      this.dummy.position.copy(s.pos);
      this.dummy.rotation.copy(s.rot);
      const k = Math.min(1, s.life);
      this.dummy.scale.setScalar(k);
      this.dummy.updateMatrix();
      this.shellMesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.shellMesh.count = n;
    this.shellMesh.instanceMatrix.needsUpdate = true;
  }
}
