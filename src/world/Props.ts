import * as THREE from 'three';
import type { BuildCtx } from './City';
import { worldBox } from './Builder';
import { grilleTexture, lanternTexture, vendingTexture } from './Textures';
import { mulberry32 } from '../core/math';

export interface PropsResult {
  steamEmitters: THREE.Vector4[]; // xyz + strength
  coverPoints: THREE.Vector3[];
  vendingGlow: THREE.Vector3;
}

function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius = 0.022): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, radius, 4, false);
}

export function buildProps(ctx: BuildCtx): PropsResult {
  const { builder: b, mats: m, col, glows, scene } = ctx;
  const rnd = mulberry32(77);
  const cable = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.5, metalness: 0.3 });

  // ---------------------------------------------------------------- Vending machines
  const vendSpots: [number, number, 'red' | 'white'][] = [
    [5.45, 27.2, 'red'],
    [5.45, 26.05, 'white'],
    [5.45, 24.9, 'red'],
    [-5.45, -6.5, 'white'],
  ];
  const vendBody: Record<string, THREE.MeshStandardMaterial> = {
    red: new THREE.MeshStandardMaterial({ color: 0xb01024, roughness: 0.35, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.3 }),
  };
  const vendFront: Record<string, THREE.MeshBasicMaterial> = {
    red: new THREE.MeshBasicMaterial({ map: vendingTexture('red'), color: new THREE.Color(1.6, 1.6, 1.6) }),
    white: new THREE.MeshBasicMaterial({ map: vendingTexture('white'), color: new THREE.Color(1.6, 1.6, 1.6) }),
  };
  const front = new THREE.PlaneGeometry(0.98, 1.8);
  for (const [x, z, theme] of vendSpots) {
    const out = x < 0 ? 1 : -1;
    b.add(worldBox(0.8, 1.9, 1.05, 1), vendBody[theme], x, 0.95, z);
    const mesh = new THREE.Mesh(front, vendFront[theme]);
    mesh.position.set(x + out * 0.405, 0.98, z);
    mesh.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(mesh);
    col.addCentered(x, 0.95, z, 0.8, 1.9, 1.05, 'metal');
  }
  const vendLightPos = new THREE.Vector3(4.2, 1.4, 26.05);
  const vl = new THREE.PointLight(0xdfefff, 22, 11, 2);
  vl.position.copy(vendLightPos);
  scene.add(vl);
  const vg = glows.add({
    pos: vendLightPos.clone(),
    color: new THREE.Color(0.85, 0.93, 1.0),
    radius: 5,
    base: 1.1,
    light: vl,
    lightBase: 22,
    haloSize: 4.5,
    haloStrength: 0.22,
    mode: 'buzz',
    reflect: { width: 3.2, anchor: new THREE.Vector3(4.9, 0, 26.05), length: 5, map: null },
  });
  vg.materials.push({ mat: vendFront.red, base: vendFront.red.color.clone() }, { mat: vendFront.white, base: vendFront.white.color.clone() });
  const v2Pos = new THREE.Vector3(-4.6, 1.3, -6.5);
  glows.add({
    pos: v2Pos,
    color: new THREE.Color(0.8, 0.9, 1.0),
    radius: 4,
    base: 0.9,
    haloSize: 3.5,
    haloStrength: 0.18,
    reflect: { width: 1.6, anchor: new THREE.Vector3(-4.9, 0, -6.5), length: 4, map: null },
  });

  // ---------------------------------------------------------------- Izakaya lanterns
  const lanternMat = new THREE.MeshStandardMaterial({
    map: lanternTexture('酒'),
    emissiveMap: lanternTexture('酒'),
    emissive: new THREE.Color(1, 0.55, 0.35),
    emissiveIntensity: 1.6,
    roughness: 0.6,
  });
  const lanternMat2 = lanternMat.clone();
  lanternMat2.map = lanternTexture('焼鳥');
  lanternMat2.emissiveMap = lanternMat2.map;
  const lathePts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    lathePts.push(new THREE.Vector2(0.05 + Math.sin(t * Math.PI) * 0.26, -0.42 + t * 0.84));
  }
  const lanternGeo = new THREE.LatheGeometry(lathePts, 14);
  const capGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10);
  const lanterns: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const z = 15 + i * 1.6;
    const lm = new THREE.Mesh(lanternGeo, i % 2 ? lanternMat2 : lanternMat);
    lm.position.set(-5.35, 2.85, z);
    lm.rotation.y = Math.PI / 2;
    scene.add(lm);
    lanterns.push(lm);
    b.add(capGeo, m.black, -5.35, 3.29, z);
    b.add(capGeo, m.black, -5.35, 2.41, z);
    b.add(new THREE.BoxGeometry(0.02, 0.3, 0.02), m.black, -5.35, 3.45, z);
  }
  // Eave over the izakaya.
  b.add(worldBox(1.3, 0.12, 9, 1), m.darkMetal, -5.4, 3.62, 18.5, 0, 0, -0.15);
  const lanternLight = new THREE.PointLight(0xff4a28, 9, 10, 2);
  lanternLight.position.set(-4.2, 2.6, 18.2);
  scene.add(lanternLight);
  glows.add({
    pos: new THREE.Vector3(-5.0, 2.85, 18.2),
    color: new THREE.Color(1.0, 0.32, 0.16),
    radius: 6,
    base: 1.3,
    light: lanternLight,
    lightBase: 9,
    haloSize: 5,
    haloStrength: 0.12,
    mode: 'buzz',
    reflect: { width: 4.5, anchor: new THREE.Vector3(-4.4, 0, 18.2), length: 5, map: null },
    onChange: (v) => {
      lanternMat.emissiveIntensity = 1.6 * v;
      lanternMat2.emissiveIntensity = 1.6 * v;
    },
  });

  // ---------------------------------------------------------------- AC units & pipes on facades
  const grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.55, metalness: 0.2 });
  const acGeo = worldBox(0.75, 0.55, 0.28, 1);
  const acBody = new THREE.MeshStandardMaterial({ color: 0xa8a69c, roughness: 0.6 });
  const acFront = new THREE.PlaneGeometry(0.72, 0.52);
  const faces: [number, number, number][] = [
    // wallX, z0, z1
    [-6, 12, 35],
    [-6, -0.5, 11.5],
    [-6, -19.5, -4.5],
    [-6, -32.5, -20.5],
    [6, 14.5, 35],
    [6, -13.5, 13.5],
    [6, -32.5, -18.5],
  ];
  for (const [wx, z0, z1] of faces) {
    const out = wx < 0 ? 1 : -1;
    const count = Math.floor((z1 - z0) / 3.5);
    for (let i = 0; i < count; i++) {
      if (rnd() < 0.35) continue;
      const z = z0 + (i + 0.5) * ((z1 - z0) / count) + (rnd() - 0.5);
      const y = 4.8 + Math.floor(rnd() * 4) * 3.2 + 0.4;
      const x = wx + out * 0.16;
      b.add(acGeo, acBody, x, y, z);
      b.add(acFront, grille, x + out * 0.142, y, z, 0, out > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      // Drain pipe running down.
      if (rnd() < 0.3) b.add(new THREE.CylinderGeometry(0.03, 0.03, y, 5), m.darkMetal, wx + out * 0.08, y / 2, z + 0.5);
    }
    // Vertical gutter pipes.
    for (let z = z0 + 1; z < z1; z += 9 + rnd() * 4) {
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 14, 6), m.paintedMetal, wx + out * 0.1, 7, z);
    }
  }

  // ---------------------------------------------------------------- Utility poles & cables
  const poles: THREE.Vector3[] = [
    new THREE.Vector3(-5.0, 0, 9.5),
    new THREE.Vector3(5.0, 0, 13),
    new THREE.Vector3(-5.0, 0, -15),
    new THREE.Vector3(5.0, 0, -22),
    new THREE.Vector3(-5.0, 0, 30),
  ];
  const poleGeo = new THREE.CylinderGeometry(0.13, 0.18, 10, 8);
  const armGeo = worldBox(1.6, 0.1, 0.1, 1);
  const transGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8);
  const tops: THREE.Vector3[][] = [];
  const guard = new THREE.MeshStandardMaterial({ color: 0xd6b21e, roughness: 0.5 });
  for (const p of poles) {
    b.add(poleGeo, m.concrete, p.x, 5, p.z);
    col.addCentered(p.x, 5, p.z, 0.36, 10, 0.36, 'concrete');
    b.add(armGeo, m.darkMetal, p.x, 9.2, p.z);
    b.add(armGeo, m.darkMetal, p.x, 8.5, p.z, 0, 0, 0, 0.8, 1, 1);
    b.add(transGeo, m.paintedMetal, p.x + (p.x < 0 ? 0.35 : -0.35), 7.6, p.z);
    // Yellow-black guard at the base.
    b.add(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 8), guard, p.x, 0.8, p.z);
    tops.push([-0.7, 0, 0.7].map((dx) => new THREE.Vector3(p.x + dx, 9.25, p.z)));
  }
  const addCable = (a: THREE.Vector3, c: THREE.Vector3, sag: number, r = 0.022) => b.add(catenary(a, c, sag, r), cable);
  // Along each side.
  const leftPoles = [0, 2, 4].map((i) => tops[i]);
  const rightPoles = [1, 3].map((i) => tops[i]);
  for (const side of [leftPoles, rightPoles]) {
    const sorted = side.slice().sort((a, c) => c[0].z - a[0].z);
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let k = 0; k < 3; k++) addCable(sorted[i][k], sorted[i + 1][k], 0.8 + rnd() * 0.6);
    }
  }
  // Across the street, pole to pole and pole to facade.
  for (const t of tops) {
    for (let k = 0; k < 3; k++) {
      const target = new THREE.Vector3(t[0].x < 0 ? 6 : -6, 6 + rnd() * 5, t[k].z + (rnd() - 0.5) * 10);
      addCable(t[k], target, 0.6 + rnd() * 1.2);
    }
  }
  // Random facade-to-facade bundles.
  for (let i = 0; i < 14; i++) {
    const z = 32 - i * 5.8 + rnd() * 2;
    const y = 6 + rnd() * 8;
    addCable(new THREE.Vector3(-6, y, z), new THREE.Vector3(6, y + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 6), 0.5 + rnd() * 1.5, 0.015 + rnd() * 0.02);
  }

  // ---------------------------------------------------------------- Traffic light at the right alley
  const tlX = 5.0;
  const tlZ = -13.4;
  b.add(new THREE.CylinderGeometry(0.09, 0.11, 5.5, 8), m.paintedMetal, tlX, 2.75, tlZ);
  col.addCentered(tlX, 2.75, tlZ, 0.25, 5.5, 0.25, 'metal');
  b.add(worldBox(3.2, 0.1, 0.1, 1), m.paintedMetal, tlX - 1.6, 5.3, tlZ);
  b.add(worldBox(1.1, 0.36, 0.3, 1), m.paintedMetal, tlX - 2.6, 5.05, tlZ);
  const lampGeo = new THREE.CircleGeometry(0.12, 12);
  const offMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.3) });
  const lamps = [
    [-0.32, offMat],
    [0, amber],
    [0.32, offMat],
  ] as const;
  for (const [dx, mat] of lamps) {
    for (const s of [1, -1]) {
      const l = new THREE.Mesh(lampGeo, mat);
      l.position.set(tlX - 2.6 + dx, 5.05, tlZ + s * 0.16);
      if (s < 0) l.rotation.y = Math.PI;
      scene.add(l);
    }
  }
  const tg = glows.add({
    pos: new THREE.Vector3(tlX - 2.6, 5.05, tlZ),
    color: new THREE.Color(1, 0.6, 0.1),
    radius: 4,
    base: 1.2,
    mode: 'blink',
    haloSize: 1.6,
    haloStrength: 0.5,
    reflect: { width: 0.9, anchor: new THREE.Vector3(tlX - 2.6, 0, tlZ), length: 7, map: null },
  });
  tg.materials.push({ mat: amber, base: amber.color.clone() });

  // ---------------------------------------------------------------- Construction barrier at the south end
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 128;
  stripeCanvas.height = 32;
  const sc = stripeCanvas.getContext('2d')!;
  for (let i = -2; i < 10; i++) {
    sc.fillStyle = i % 2 ? '#111' : '#e8c21a';
    sc.beginPath();
    sc.moveTo(i * 16, 32);
    sc.lineTo(i * 16 + 16, 0);
    sc.lineTo(i * 16 + 32, 0);
    sc.lineTo(i * 16 + 16, 32);
    sc.fill();
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = THREE.RepeatWrapping;
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8f949c, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.55 });
  for (let x = -5.5; x <= 5.5; x += 2.2) {
    b.add(worldBox(2, 0.25, 0.08, 1), stripeMat, x, 0.95, 33.4);
    b.add(worldBox(2, 0.25, 0.08, 1), stripeMat, x, 0.45, 33.4);
    b.add(worldBox(0.08, 1.1, 0.4, 1), m.darkMetal, x - 0.95, 0.55, 33.4);
  }
  b.add(worldBox(12, 2.6, 0.05, 1), fenceMat, 0, 1.3, 34.2);
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.2) });
  for (let i = 0; i < 4; i++) {
    const x = -4.5 + i * 3;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), blinkMat);
    lamp.position.set(x, 1.15, 33.4);
    scene.add(lamp);
  }
  const bg = glows.add({
    pos: new THREE.Vector3(0, 1.2, 33.2),
    color: new THREE.Color(1, 0.55, 0.05),
    radius: 5,
    base: 1,
    mode: 'blink',
    haloSize: 3,
    haloStrength: 0.25,
    seed: 1.3,
  });
  bg.materials.push({ mat: blinkMat, base: blinkMat.color.clone() });

  // ---------------------------------------------------------------- Cover: dumpsters, crates, bags
  const dumpMat = new THREE.MeshStandardMaterial({ color: 0x2c4a3a, roughness: 0.45, metalness: 0.5, envMapIntensity: 1 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a6fa8, roughness: 0.6 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.2, metalness: 0.1, envMapIntensity: 1.4 });
  const dumpster = (x: number, z: number, ry = 0) => {
    const sx = ry ? 1.1 : 1.8;
    const sz = ry ? 1.8 : 1.1;
    b.add(worldBox(sx, 1.2, sz, 1), dumpMat, x, 0.65, z);
    b.add(worldBox(sx + 0.1, 0.08, sz + 0.1, 1), m.darkMetal, x, 1.3, z, ry ? 0 : 0.08, 0, ry ? 0.08 : 0);
    col.addCentered(x, 0.65, z, sx, 1.3, sz, 'metal');
  };
  const crates = (x: number, z: number) => {
    b.add(worldBox(0.9, 0.9, 0.9, 1), crateMat, x, 0.45, z);
    b.add(worldBox(0.9, 0.9, 0.9, 1), crateMat, x + 0.2, 1.35, z + 0.1, 0, 0.3, 0);
    b.add(worldBox(0.9, 0.9, 0.9, 1), crateMat, x, 0.45, z + 0.95);
    col.addCentered(x + 0.05, 0.9, z + 0.47, 1.05, 1.8, 1.9, 'wood');
  };
  dumpster(-4.6, -10.5, 1);
  dumpster(4.6, 4.5, 1);
  dumpster(-20, -1.6);
  dumpster(19, -17.3);
  crates(4.4, -24);
  crates(-4.6, -29);
  crates(-4.5, 1.6);
  crates(3.8, -40);
  // Trash bags (not solid, just shapes).
  const bagGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (let i = 0; i < 16; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const z = 30 - rnd() * 75;
    b.add(bagGeo, bagMat, side * (5.4 - rnd() * 0.4), 0.25, z, 0, rnd() * 3, 0, 1, 0.75 + rnd() * 0.3, 1);
  }
  // Bicycles parked against the wall (simple silhouettes).
  const wheel = new THREE.TorusGeometry(0.33, 0.025, 4, 16);
  for (let i = 0; i < 4; i++) {
    const z = 21 - i * 0.7;
    const x = 5.3;
    b.add(wheel, m.darkMetal, x, 0.35, z - 0.0, 0, Math.PI / 2 + 0.2, 0);
    b.add(wheel, m.darkMetal, x - 0.2, 0.35, z - 0.0 + 0.0, 0, Math.PI / 2 + 0.2, 0, 1, 1, 1);
    b.add(worldBox(0.04, 0.04, 1.0, 1), m.darkMetal, x - 0.1, 0.62, z, 0.3, 0.2, 0);
  }

  // ---------------------------------------------------------------- Street vents (steam sources)
  const ventGeo = worldBox(1.2, 0.04, 0.8, 1);
  const steamEmitters = [
    new THREE.Vector4(3.4, 0.05, 1.0, 1.0),
    new THREE.Vector4(-2.4, 0.05, -24, 0.8),
    new THREE.Vector4(-18, 0.05, -2.5, 1.0),
    new THREE.Vector4(17, 0.05, -16, 0.9),
    new THREE.Vector4(-4.8, 3.6, 21, 0.5), // izakaya kitchen exhaust
  ];
  for (const e of steamEmitters) {
    if (e.y < 0.1) b.add(ventGeo, m.darkMetal, e.x, 0.02, e.z);
  }
  b.add(worldBox(0.6, 0.4, 0.6, 1), m.paintedMetal, -5.7, 3.6, 21);

  // ---------------------------------------------------------------- Far street lamp (backlight for the far end)
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 5.6, 8), m.paintedMetal, -4.9, 2.8, -46);
  col.addCentered(-4.9, 2.8, -46, 0.22, 5.6, 0.22, 'metal');
  b.add(worldBox(1.8, 0.08, 0.08, 1), m.paintedMetal, -4.1, 5.55, -46);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 3.2, 3.0) });
  const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.25), lampMat);
  lampHead.position.set(-3.3, 5.45, -46);
  scene.add(lampHead);
  const farLight = new THREE.PointLight(0xa8fff0, 30, 14, 2);
  farLight.position.set(-3.3, 5.0, -46);
  scene.add(farLight);
  const fl = glows.add({
    pos: new THREE.Vector3(-3.3, 5.3, -46),
    color: new THREE.Color(0.6, 1.0, 0.92),
    radius: 7,
    base: 1.2,
    light: farLight,
    lightBase: 30,
    haloSize: 9,
    haloStrength: 0.4,
    mode: 'flicker',
    reflect: { width: 1.6, anchor: new THREE.Vector3(-3.3, 0, -46), length: 9, map: null },
  });
  fl.materials.push({ mat: lampMat, base: lampMat.color.clone() });

  // Fluorescent tubes under the railway deck.
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.8, 2.6) });
  for (const x of [-3, 3]) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.08), tubeMat);
    tube.position.set(x, 6.3, -35);
    scene.add(tube);
  }
  const tg2 = glows.add({
    pos: new THREE.Vector3(0, 6.1, -35),
    color: new THREE.Color(0.75, 0.95, 0.85),
    radius: 6,
    base: 0.9,
    haloSize: 5,
    haloStrength: 0.15,
    mode: 'broken',
    reflect: { width: 6.5, anchor: new THREE.Vector3(0, 0, -35), length: 7, map: null },
  });
  tg2.materials.push({ mat: tubeMat, base: tubeMat.color.clone() });

  const coverPoints = [
    new THREE.Vector3(-3.6, 0, -10.5),
    new THREE.Vector3(3.3, 0, -23.5),
    new THREE.Vector3(-3.6, 0, -29),
    new THREE.Vector3(3.6, 0, 4.5),
    new THREE.Vector3(0, 0, -33.2),
    new THREE.Vector3(-8.5, 0, -2.5),
    new THREE.Vector3(8.5, 0, -16),
    new THREE.Vector3(3, 0, -40),
    new THREE.Vector3(-3, 0, -18),
    new THREE.Vector3(2.5, 0, -12),
  ];
  return { steamEmitters, coverPoints, vendingGlow: vendLightPos };
}
