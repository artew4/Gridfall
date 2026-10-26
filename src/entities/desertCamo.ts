import * as THREE from 'three';
import type { TeamId } from '../combat/Team';

/*
  81.0, the Desert's two teams in sand khaki (docs: PROGRESS 81.0). One palette per team, shared by what
  the player sees of himself (his sleeves: a texture, theme.ts) and how the bots wear it (their cloth:
  the same blotches in a shader, operators.ts), so his arm and his mates' arms are the same cloth.

    ALPHA, "Rangers"   arid camo with an olive cast, ranger-green-khaki plates and helmet, blue tape
    OMEGA, "Dunes"     light three-colour desert camo, coyote plates, rust-brown helmet and pouches,
                       orange tape

  Both read as sand at a distance; up close the greener and the browner team are told apart, and the
  tape (armbands, the helmet's band: matte, not lit) carries the HUD's colours.
*/

export interface DesertCamo {
  /** The cloth's ground colour, then the blotches over it, lightest to darkest. */
  base: number;
  spots: [number, number, number];
}

export const DESERT_CAMO: Record<TeamId, DesertCamo> = {
  alpha: { base: 0xbcae88, spots: [0xd2c6a2, 0x9a9470, 0x75684c] },
  omega: { base: 0xc9b48e, spots: [0xddcdaa, 0x9c7a52, 0x6e5238] },
};

/** The gear's solid colours by team (plates, the team's blocks: helmet, pouches, pads; webbing; boots). */
export const DESERT_GEAR: Record<TeamId, { armor: number; team: number; webbing: number; boots: number }> = {
  alpha: { armor: 0x8a8662, team: 0x75785a, webbing: 0x8c805e, boots: 0x5a4b37 },
  omega: { armor: 0x8f7150, team: 0x7a4e33, webbing: 0x9c8664, boots: 0x5e4a34 },
};

/** The tape (armbands, the helmet band, the back patch): the HUD's team colours, matte. */
export const DESERT_TAPE: Record<TeamId, THREE.Color> = {
  alpha: new THREE.Color(0.18, 0.5, 1.0),
  omega: new THREE.Color(1.0, 0.36, 0.1),
};

const cache: Partial<Record<TeamId, THREE.CanvasTexture>> = {};

/** The team's camo as a tiling texture (the sleeves'): the shader's blotches, painted. */
export function desertCamoTexture(team: TeamId): THREE.CanvasTexture {
  if (cache[team]) return cache[team]!;
  const p = DESERT_CAMO[team];
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(p.base);
  g.fillRect(0, 0, S, S);
  let seed = team === 'alpha' ? 81 : 82;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Larger soft blotches first (the light and the mid), small dark ones on top (the arid pattern).
  for (const [col, n, r] of [[p.spots[0], 9, 18], [p.spots[1], 12, 14], [p.spots[2], 16, 6]] as const) {
    g.fillStyle = hex(col);
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, rx = r * (0.6 + rnd() * 0.8), ry = r * (0.35 + rnd() * 0.5), a = rnd() * Math.PI;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  cache[team] = t;
  return t;
}

/** FDE (flat dark earth) and coyote for the guns, and a desert camo for their furniture. */
export const DESERT_GUN = { fde: 0x7a664c, coyote: 0x8c7556, dark: 0x2e2c28 };

let furniture: THREE.CanvasTexture | null = null;
/** The guns' furniture: the two teams' sand in big soft patches (the same rifle both sides carry). */
export function desertGunCamo(): THREE.CanvasTexture {
  if (furniture) return furniture;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9c8662';
  g.fillRect(0, 0, S, S);
  let seed = 83;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [col, n, r] of [['#b8a27a', 10, 20], ['#7e6a4c', 10, 16], ['#5e4e3a', 8, 9]] as const) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, rx = r * (0.6 + rnd() * 0.8), ry = r * (0.4 + rnd() * 0.5), a = rnd() * Math.PI;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  furniture = new THREE.CanvasTexture(c);
  furniture.wrapS = furniture.wrapT = THREE.RepeatWrapping;
  furniture.colorSpace = THREE.SRGBColorSpace;
  furniture.userData.shared = true;
  return furniture;
}
