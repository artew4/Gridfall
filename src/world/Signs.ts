import * as THREE from 'three';
import type { BuildCtx } from './City';
import type { FlickerMode, Glow } from './Glows';
import { blurredCopy, signTexture, type SignStyle } from './Textures';

export interface SignSpec {
  text: string;
  color: string;
  style: SignStyle;
  vertical: boolean;
  /** 'perp' projects from the wall (faces ±z), 'wall' is flat on a ±x facade, 'front' faces +z. */
  mount: 'perp' | 'wall' | 'front';
  x: number;
  y: number;
  z: number;
  /** Long dimension in metres. */
  size: number;
  mode?: FlickerMode;
  brightness?: number;
  light?: number;
  lightDist?: number;
  reflect?: boolean;
  bg?: string;
  textColor?: string;
  hum?: boolean;
  halo?: number;
}

export interface SignGlow extends Glow {
  hum?: boolean;
}

export function addSign(ctx: BuildCtx, s: SignSpec): SignGlow {
  const map = signTexture({ text: s.text, vertical: s.vertical, color: s.color, style: s.style, bg: s.bg, textColor: s.textColor });
  const aspect = map.userData.aspect as number;
  const h = s.vertical ? s.size : s.size / aspect;
  const w = s.vertical ? s.size * aspect : s.size;
  const bright = s.brightness ?? (s.style === 'box' ? 1.35 : 3.2);
  const color = new THREE.Color(s.color);
  const mat = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(bright, bright, bright) });
  const plane = new THREE.PlaneGeometry(w, h);
  const group = new THREE.Group();
  group.position.set(s.x, s.y, s.z);
  const frameMat = ctx.mats.darkMetal;
  const b = ctx.builder;
  // Street side of the facade: signs on the left face +x.
  const out = s.x < 0 ? 1 : -1;
  if (s.mount === 'perp') {
    const front = new THREE.Mesh(plane, mat);
    front.position.z = 0.09;
    const back = new THREE.Mesh(plane, mat);
    back.rotation.y = Math.PI;
    back.position.z = -0.09;
    group.add(front, back);
    b.add(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.16), frameMat, s.x, s.y, s.z);
    // Brackets to the wall.
    const wallX = out > 0 ? -6 : 6;
    const bx = (wallX + s.x - (out * w) / 2) / 2;
    const blen = Math.abs(wallX - (s.x - (out * w) / 2)) + 0.05;
    for (const dy of [h * 0.35, -h * 0.35]) {
      b.add(new THREE.BoxGeometry(blen, 0.06, 0.06), frameMat, bx, s.y + dy, s.z);
    }
  } else if (s.mount === 'wall') {
    const m = new THREE.Mesh(plane, mat);
    m.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(m);
    b.add(new THREE.BoxGeometry(0.16, h + 0.12, w + 0.12), frameMat, s.x - out * 0.09, s.y, s.z);
  } else {
    const m = new THREE.Mesh(plane, mat);
    group.add(m);
    b.add(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.16), frameMat, s.x, s.y, s.z - 0.09);
  }
  ctx.scene.add(group);

  let light: THREE.PointLight | undefined;
  const lp = new THREE.Vector3(s.x, s.y, s.z);
  if (s.mount !== 'front') lp.x += out * (s.mount === 'perp' ? 1.2 : 1.0);
  else lp.z += 1.5;
  if (s.light) {
    light = new THREE.PointLight(color, s.light, s.lightDist ?? 16, 2);
    light.position.copy(lp);
    light.position.y = Math.min(lp.y, 5);
    ctx.scene.add(light);
  }
  const anchor = new THREE.Vector3(s.mount === 'front' ? s.x : s.x + out * 0.6, 0, s.mount === 'front' ? s.z + 1 : s.z);
  const glow = ctx.glows.add({
    pos: lp,
    color,
    radius: 4 + s.size * 0.8,
    base: 1.2,
    mode: s.mode ?? 'steady',
    light,
    lightBase: s.light ?? 0,
    haloSize: s.halo ?? Math.max(w, h) * 1.4,
    haloStrength: s.style === 'box' ? 0.18 : 0.3,
    reflect: s.reflect === false ? undefined : { width: Math.max(w, 1.2) * 1.3, anchor, length: 5 + s.y * 1.1, map: blurredCopy(map, s.style === 'box' ? 4 : 8) },
  }) as SignGlow;
  glow.materials.push({ mat, base: mat.color.clone() });
  glow.hum = s.hum;
  return glow;
}

/** All signage on the street. Composition: cool cyan/magenta mid-street, warm red near the izakaya, a hot pink focal sign at the far end. */
export function buildSigns(ctx: BuildCtx): SignGlow[] {
  const specs: SignSpec[] = [
    { text: 'カラオケ', color: '#22e8ff', style: 'neon', vertical: true, mount: 'perp', x: -5.0, y: 8.8, z: 6, size: 5.6, light: 28, hum: true, mode: 'steady' },
    { text: 'ホテル', color: '#ff2fd0', style: 'neon', vertical: true, mount: 'perp', x: 5.1, y: 7.4, z: -3, size: 4.4, light: 26, mode: 'broken', hum: true },
    { text: '居酒屋', color: '#ff3a24', style: 'neon', vertical: true, mount: 'perp', x: -5.2, y: 6.2, z: 26, size: 3.4, mode: 'buzz' },
    { text: '薬', color: '#2cff9a', style: 'box', bg: '#12b866', textColor: '#ffffff', vertical: true, mount: 'perp', x: 5.25, y: 4.7, z: 17.5, size: 1.4 },
    { text: 'ラーメン', color: '#ffae2a', style: 'neon', vertical: false, mount: 'wall', x: -5.95, y: 4.9, z: -12, size: 4.2, light: 18, mode: 'buzz' },
    { text: 'BAR夜', color: '#a855ff', style: 'neon', vertical: false, mount: 'wall', x: 5.95, y: 4.8, z: -25.5, size: 3.2, mode: 'flicker' },
    { text: '東京酒場', color: '#ff2a6d', style: 'neon', vertical: false, mount: 'front', x: 0, y: 17, z: -53.85, size: 16, brightness: 3.6, halo: 22 },
    { text: '麻雀', color: '#39ffd9', style: 'neon', vertical: true, mount: 'perp', x: 5.3, y: 6.0, z: 9, size: 2.4, mode: 'flicker' },
    { text: '質屋', color: '#ffc04a', style: 'box', bg: '#f2b028', textColor: '#1a1206', vertical: true, mount: 'perp', x: -5.3, y: 5.6, z: -9, size: 2.4 },
    { text: 'ゲーム', color: '#7a6bff', style: 'neon', vertical: true, mount: 'perp', x: 5.3, y: 5.8, z: 30, size: 3.0, mode: 'steady' },
    { text: 'スナック', color: '#ff69c8', style: 'box', bg: '#ff5fbf', textColor: '#2a0018', vertical: true, mount: 'perp', x: -5.2, y: 6.5, z: -26, size: 3.6, mode: 'flicker' },
    { text: '営業中', color: '#ff7b30', style: 'neon', vertical: false, mount: 'wall', x: -5.95, y: 3.65, z: 30, size: 1.6, reflect: false },
    { text: '新宿三丁目', color: '#5fd0ff', style: 'box', bg: '#0f3a8a', textColor: '#ffffff', vertical: false, mount: 'wall', x: 5.95, y: 9.5, z: 22, size: 4.5, reflect: false, brightness: 1.0 },
  ];
  return specs.map((s) => addSign(ctx, s));
}
