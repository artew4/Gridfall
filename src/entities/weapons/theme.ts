import * as THREE from 'three';
import type { Ballistic } from '../types';

/*
  21.0, weapon themes: every gun is built from the same parts, its materials picked by the map's look.
  The models (kitsune9, hornet, jackal, shotgun) never name a colour: they ask for a role (the frame,
  the furniture, the trim, the glow...) and the theme answers. One model, three finishes:

   - 'blaster' (Tokyo, Neon Block, Neon Docks): dark sleek gunmetal and graphite polymer, neon
     emissive strips and rings, energy bolts from the pistol and the SMG.
   - 'military' (Desert, Firebase Viper, Crash Site, Old Port): matte black and parkerized steel, olive
     drab and coyote polymer, wood and woodland camo furniture, nothing that glows; every gun kinetic
     (tracers, brass).
   - 'corporate' (Maglev Terminal): white gloss polymer, carbon-fibre panels, satin aluminium, small
     cyan indicator lights (dim: a status LED, not a neon tube); the pistol and the SMG fire energy.

  Materials are made fresh for each build (the viewmodel and the menu stage dispose what they built);
  textures (camo, carbon weave) are made once per theme and shared, never disposed with a model.
  The bots carry the same finish: their rig gun takes the theme's frame, furniture and glow (Tdm).
*/

export type GunTheme = 'blaster' | 'military' | 'corporate';

/** Material roles a gun model asks for. */
export interface GunMats {
  /** Receiver, slide, barrel: the main metal. */
  frame: THREE.MeshStandardMaterial;
  /** Darker or worn metal: bolts, rails, pins, the muzzle device. */
  steel: THREE.MeshStandardMaterial;
  /** Grips, lower frames, magazines' bodies. */
  polymer: THREE.MeshStandardMaterial;
  /** Stocks, handguards, fore-ends: the gun's "furniture" (tan, camo, wood, white plastic, carbon). */
  furniture: THREE.MeshStandardMaterial;
  /** Polished trim: slide tops, triggers, magazine plates. */
  trim: THREE.MeshStandardMaterial;
  /**
   * Accent strips, rings, the ammo bars: glowing on 'blaster' (the viewmodel swaps it for its own
   * ammo-strip material), a dim LED on 'corporate', plain dark metal on 'military'.
   */
  glow: THREE.Material;
  /** Does `glow` glow (the viewmodel lights the ammo strips only then). */
  glows: boolean;
  glove: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
  /** The sleeve's cuff (a stripe on 'blaster', plain otherwise). */
  cuff: THREE.Material;
}

interface Palette {
  frame: [number, number, number, number];
  steel: [number, number, number, number];
  polymer: [number, number, number, number];
  furniture: [number, number, number, number];
  trim: [number, number, number, number];
  /** Linear HDR colour of the glow, or null: no glow (matte dark metal instead). */
  glow: [number, number, number] | null;
  glove: number;
  sleeve: number;
  /** A texture on the furniture (and the sleeve), made once per theme. */
  furnitureMap?: () => THREE.Texture;
  sleeveMap?: boolean;
}

/** colour, metalness, roughness, envMapIntensity */
const PALETTES: Record<GunTheme, Palette> = {
  blaster: {
    frame: [0x5c6070, 0.8, 0.3, 1.4],
    steel: [0x2a2c33, 0.7, 0.35, 1.1],
    polymer: [0x24262d, 0.25, 0.5, 1.0],
    furniture: [0x1c1e24, 0.35, 0.45, 1.0],
    trim: [0xb0b5bf, 0.9, 0.18, 2],
    glow: [0.3, 2.4, 3.0],
    glove: 0x24242a,
    sleeve: 0x2a2d3a,
  },
  military: {
    frame: [0x222322, 0.55, 0.55, 0.8],
    steel: [0x3c3d3a, 0.7, 0.45, 0.9],
    polymer: [0x3d4230, 0.05, 0.85, 0.5],
    furniture: [0xffffff, 0.05, 0.8, 0.5],
    trim: [0x55574f, 0.7, 0.45, 1.0],
    glow: null,
    glove: 0x4a4636,
    sleeve: 0xb8b8a8,
    furnitureMap: () => woodlandCamo(),
    sleeveMap: true,
  },
  corporate: {
    frame: [0xc4c9cd, 0.15, 0.3, 0.9],
    steel: [0xa9b0b6, 0.85, 0.25, 1.4],
    polymer: [0xb4babf, 0.05, 0.38, 0.85],
    furniture: [0xffffff, 0.3, 0.35, 1.2],
    trim: [0x2a2f35, 0.6, 0.3, 1.2],
    glow: [0.25, 1.1, 1.6],
    glove: 0x9aa1a7,
    sleeve: 0x9ea5ab,
    furnitureMap: () => carbonWeave(),
  },
};

const maps: Partial<Record<GunTheme, THREE.Texture>> = {};
/** The theme's furniture texture (made once, shared by every build, never disposed with a model). */
function furnitureMap(theme: GunTheme) {
  const p = PALETTES[theme];
  if (!p.furnitureMap) return null;
  if (!maps[theme]) {
    const t = p.furnitureMap();
    t.userData.shared = true;
    maps[theme] = t;
  }
  return maps[theme]!;
}

/** Fresh materials for one build of a gun in `theme`. */
export function gunMats(theme: GunTheme): GunMats {
  const p = PALETTES[theme];
  const std = ([color, metalness, roughness, env]: [number, number, number, number], map: THREE.Texture | null = null) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: env, map });
  const fm = furnitureMap(theme);
  const glow = p.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.glow) }) : std([0x2b2c2a, 0.6, 0.5, 0.8]);
  return {
    frame: std(p.frame),
    steel: std(p.steel),
    polymer: std(p.polymer),
    furniture: std(p.furniture, fm),
    trim: std(p.trim),
    glow,
    glows: !!p.glow,
    glove: new THREE.MeshStandardMaterial({ color: p.glove, roughness: 0.8, metalness: 0.05 }),
    sleeve: new THREE.MeshStandardMaterial({ color: p.sleeve, roughness: 0.88, map: p.sleeveMap ? fm : null }),
    cuff: p.glow ? glow : std([0x2b2c2a, 0.3, 0.7, 0.5]),
  };
}

/** The colour the viewmodel's ammo strips take (HDR), or null: the theme doesn't glow. */
export function stripColour(theme: GunTheme): THREE.Color | null {
  const g = PALETTES[theme].glow;
  return g ? new THREE.Color(...g) : null;
}

/**
 * What a gun fires in a theme: energy bolts only where the look is sci-fi and the gun was built for
 * them (the pistol and the SMG), kinetic everywhere else (and every gun on a 'military' map).
 */
export function ballisticFor(base: Ballistic, theme: GunTheme): Ballistic {
  return theme === 'military' ? 'kinetic' : base;
}

/** The theme a map's guns wear: Maglev's corporate, the neon maps' blaster, the rest military. */
export function gunThemeFor(setting: string): GunTheme {
  if (setting === 'maglev') return 'corporate';
  if (setting === 'tokyo' || setting === 'neonblock' || setting === 'docks') return 'blaster';
  return 'military';
}

/*
  The bots' guns: their rig gun is a few merged boxes in the kit's shared gun material. On spawn it
  takes the theme's (one shared material per theme) and, where the theme glows, a pair of accent
  strips down its sides (one shared geometry and material): no per-bot material, nothing to free.
*/
const BOT_GUN: Record<GunTheme, { color: number; metalness: number; roughness: number; env: number }> = {
  blaster: { color: 0x3a3e48, metalness: 0.7, roughness: 0.35, env: 0.6 },
  military: { color: 0x2a2b27, metalness: 0.4, roughness: 0.7, env: 0.3 },
  corporate: { color: 0xdfe3e6, metalness: 0.15, roughness: 0.35, env: 0.6 },
};
const botMats: Partial<Record<GunTheme, { body: THREE.Material; accent: THREE.Material | null }>> = {};
let accentGeo: THREE.BufferGeometry | null = null;
function botFinish(theme: GunTheme) {
  if (!botMats[theme]) {
    const b = BOT_GUN[theme], g = PALETTES[theme].glow;
    const body = new THREE.MeshStandardMaterial({ color: b.color, metalness: b.metalness, roughness: b.roughness, envMapIntensity: b.env });
    const accent = g ? new THREE.MeshBasicMaterial({ color: new THREE.Color(...g).multiplyScalar(0.8) }) : null;
    body.userData.shared = true;
    if (accent) accent.userData.shared = true;
    botMats[theme] = { body, accent };
  }
  if (!accentGeo) {
    accentGeo = new THREE.BoxGeometry(0.004, 0.014, 0.4);
    accentGeo.userData.shared = true;
  }
  return botMats[theme]!;
}

/** Give a bot's rig gun (its `weapon` pivot) the theme's finish: the body material, the accent strips. */
export function themeRigGun(weapon: THREE.Object3D, theme: GunTheme) {
  const f = botFinish(theme);
  for (const o of weapon.children) {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.gunAccent && (m.material as THREE.Material).userData.shared) m.material = f.body;
  }
  if (!f.accent) return;
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(accentGeo!, f.accent);
    a.userData.gunAccent = true;
    a.position.set(s * 0.037, 0.02, 0.02);
    weapon.add(a);
  }
}

/**
 * A bot's gun in a theme: its rounds kinetic on a military map, and on Maglev the energy bolts in the
 * hall's cool white-cyan. A fresh copy per spawn (the armory's entry is never changed, and a DEV A/B
 * that edits it is seen at once).
 */
export function themedArm<T extends { ballistic: Ballistic; bolt: { core: [number, number, number]; trail: [number, number, number]; size: number } }>(arm: T, theme: GunTheme): T {
  const a = { ...arm, ballistic: ballisticFor(arm.ballistic, theme) };
  if (theme === 'corporate' && arm.ballistic === 'energy') a.bolt = { core: [2.2, 3.4, 4.2], trail: [0.5, 0.8, 1.0], size: arm.bolt.size };
  return a;
}

/** Woodland camo: olive base, blotches of dark green, brown and khaki (tiles). */
function woodlandCamo() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4c5530';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [col, n, r] of [['#2c3520', 14, 16], ['#5e4a30', 10, 13], ['#7d7a52', 8, 10], ['#1d2216', 9, 8]] as const) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 128, y = rnd() * 128;
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r * (0.6 + rnd() * 0.8), r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return tile(c);
}

/** Carbon-fibre twill: a 2/2 weave of dark tows with a satin sheen across them (tiles). */
function carbonWeave() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, 64, 64);
  const n = 8, s = 64 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const warp = (i + j) % 4 < 2;
    const grd = warp ? g.createLinearGradient(i * s, 0, (i + 1) * s, 0) : g.createLinearGradient(0, j * s, 0, (j + 1) * s);
    grd.addColorStop(0, '#202327');
    grd.addColorStop(0.5, '#3a3f45');
    grd.addColorStop(1, '#202327');
    g.fillStyle = grd;
    g.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
  }
  return tile(c);
}

function tile(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
