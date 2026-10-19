import * as THREE from 'three';
import type { Glows, Glow } from './Glows';
import { STREET } from './City';
import { rand } from '../core/math';

/** A commuter train that periodically crosses the overpass: moving light, pantograph arcs, rumble. */
export class Train {
  group = new THREE.Group();
  light: THREE.PointLight;
  glow: Glow;
  arc: Glow;
  x = -400;
  speed = 24;
  dir = 1;
  timer = 6;
  active = false;
  onPass: (dir: number) => void = () => {};

  constructor(scene: THREE.Scene, glows: Glows) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#1a7a3a';
    ctx.fillRect(0, 44, 512, 6);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = '#f2f6ff';
      ctx.fillRect(14 + i * 50, 12, 38, 26);
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const e = document.createElement('canvas');
    e.width = 512;
    e.height = 64;
    const ectx = e.getContext('2d')!;
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 10; i++) {
      ectx.fillStyle = '#dfeaff';
      ectx.fillRect(14 + i * 50, 12, 38, 26);
    }
    const emap = new THREE.CanvasTexture(e);
    emap.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 3.0, roughness: 0.4, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.6 });
    const carGeo = new THREE.BoxGeometry(19, 3, 2.9);
    // Only the long sides get the window texture.
    const mats = [dark, dark, dark, dark, mat, mat];
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Mesh(carGeo, mats);
      car.position.set(i * 19.6, 9.45, 0);
      this.group.add(car);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.06), dark);
      pan.position.set(i * 19.6, 11.2, 0);
      this.group.add(pan);
    }
    this.group.position.set(this.x, 0, STREET.overpassZ);
    scene.add(this.group);

    this.light = new THREE.PointLight(0xcfe0ff, 0, 30, 1.6);
    this.light.position.set(0, 8.5, STREET.overpassZ + 4);
    scene.add(this.light);
    this.glow = glows.add({
      pos: new THREE.Vector3(0, 9, STREET.overpassZ),
      color: new THREE.Color(0.8, 0.88, 1.0),
      radius: 12,
      base: 0,
      mode: 'steady',
      haloSize: 0.01,
      haloStrength: 0,
    });
    this.arc = glows.add({
      pos: new THREE.Vector3(0, 11.4, STREET.overpassZ),
      color: new THREE.Color(0.4, 0.6, 1.0),
      radius: 10,
      base: 0,
      mode: 'steady',
      haloSize: 5,
      haloStrength: 0,
    });
  }

  update(dt: number) {
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.x = this.dir > 0 ? -260 : 160;
        this.onPass(this.dir);
      }
      this.light.intensity = 0;
      this.glow.base = 0;
      this.arc.haloStrength = 0;
      this.arc.base = 0;
      return;
    }
    this.x += this.dir * this.speed * dt;
    this.group.position.x = this.x;
    const centre = this.x + 49;
    // Light follows the train, clamped to the stretch visible from the street.
    const lx = THREE.MathUtils.clamp(centre, -24, 24);
    const vis = Math.max(0, 1 - Math.abs(centre - lx) / 60);
    this.light.position.x = lx;
    this.light.intensity = 160 * vis;
    this.glow.pos.set(lx, 8.8, STREET.overpassZ + 2);
    this.glow.base = 1.2 * vis;
    // Random pantograph arcs.
    const arcOn = Math.random() < 0.04 ? 1 : 0;
    this.arc.pos.set(centre + (Math.random() - 0.5) * 80, 11.4, STREET.overpassZ);
    this.arc.base = arcOn * 2;
    this.arc.haloStrength = arcOn * 0.9 * (Math.abs(this.arc.pos.x) < 40 ? 1 : 0);
    if ((this.dir > 0 && this.x > 220) || (this.dir < 0 && this.x < -320)) {
      this.active = false;
      this.timer = rand(28, 45);
    }
  }
}
