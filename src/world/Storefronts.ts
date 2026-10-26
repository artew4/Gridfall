import * as THREE from 'three';
import type { StaticBuilder } from './Builder';
import { propKits, type MercPart } from '../entities/weapons/models';
import { ROOMS, interiorMaterial, roomUV, type Room } from './Interiors';
import { awningTexture, directoryTexture, norenTexture, planarInto, shutterTexture, signCell, signs, type SignTrade } from './StoreSigns';
import { woodTexture } from '../levels/desert/textures';
import { applyWear, wearRoles } from './Wear';

/*
  78.0, Night Tokyo's storefronts (docs/TOKYO_PLAN.md, step 1): every 4 m slot a block's face lists is
  drawn as a front from tools/blender/props_store.py over a glass plane whose shader shows the room
  behind it (Interiors.ts), its sign its own (StoreSigns.ts). Nothing is added to the colliders: the
  fronts keep within 0.12 m of the wall under head height (handles 0.17) (signs, eaves, lanterns, awnings above it).

    shop      a shop's aluminium front over one of six rooms (konbini, drugstore, electronics, boutique,
              cafe, books), the lightbox sign of its trade; an awning over most
    izakaya   the wooden front, koshi, noren, eave and lanterns over an izakaya's or a ramen shop's room
    shutter   a closed shop: the roll shutter (one of three curtains: graffiti, grime), an unlit sign
    door      a building's entrance over its lobby: mailboxes, intercom, the lit tenant directory,
              the canopy, the building's name

  Which room, sign, curtain and noren a slot gets comes from its position (the map's seeded stream is
  left as it was). Without the kit, City draws its flat storefront planes as before.
*/

export type StoreKind = 'shutter' | 'shop' | 'izakaya' | 'door';
const NODE: Record<StoreKind, string> = { shop: 'sf_shop', izakaya: 'sf_izakaya', shutter: 'sf_shutter', door: 'sf_door' };
const SHOP_ROOMS: Room[] = ['konbini', 'drugstore', 'electronics', 'boutique', 'cafe', 'books'];

/** A slot's own number from where it is (stable, spread). */
function hash(x: number, y: number, z: number) {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(y * 10) | 0, 19349663) ^ Math.imul(Math.round(z * 10) | 0, 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export class Storefronts {
  private kit: Record<string, readonly MercPart[]> | null;
  private glass = interiorMaterial();
  private plane = new THREE.PlaneGeometry(4, 3.8);
  private mats: Record<string, THREE.Material>;
  private signOn: THREE.MeshStandardMaterial;
  private signOff: THREE.MeshStandardMaterial;
  private dir: THREE.MeshStandardMaterial;
  private noren: THREE.MeshStandardMaterial;
  private shutter: THREE.MeshStandardMaterial;
  private canvas: THREE.MeshStandardMaterial;
  private handed: Partial<Record<SignTrade, number>> = {};
  /** DEV: what was laid (tests, screenshots). */
  stats = { slots: 0, rooms: {} as Record<string, number> };

  constructor(private b: StaticBuilder) {
    const k = propKits();
    this.kit = k && k.sf_shop ? (k as Record<string, readonly MercPart[]>) : null;
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.8, ...o });
    const wood = woodTexture();
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    this.mats = {
      metal: std({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.0 }),
      dark: std({ color: 0x141518, roughness: 0.55, metalness: 0.3 }),
      sign: std({ color: 0x1e1f23, metalness: 0.6, roughness: 0.4 }),
      wood: std({ map: wood, color: 0x8a5a3a, roughness: 0.75 }),
      tile: std({ color: 0x2b2d33, metalness: 0.35, roughness: 0.45, envMapIntensity: 1.1 }),
      paper: std({ color: 0xf0e8d4, emissive: 0xf0e2c0, emissiveIntensity: 0.35, roughness: 0.9 }),
      wtile: std({ color: 0xc4beb2, roughness: 0.35, envMapIntensity: 1.0 }),
      light: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.92, 0.75).multiplyScalar(2.2) }),
      lantern: std({ color: 0xe8261c, emissive: 0xff4a2a, emissiveIntensity: 1.4, roughness: 0.7 }),
    };
    const s = signs();
    this.signOn = std({ map: s, emissiveMap: s, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3 });
    this.signOff = std({ map: s, color: 0x9a9a9a, roughness: 0.5 });
    const d = directoryTexture();
    this.dir = std({ map: d, emissiveMap: d, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 });
    this.noren = std({ map: norenTexture(), roughness: 0.95, side: THREE.DoubleSide });
    this.shutter = std({ map: shutterTexture(), metalness: 0.55, roughness: 0.5, envMapIntensity: 0.9 });
    this.canvas = std({ map: awningTexture(), roughness: 0.9, side: THREE.DoubleSide });
    // 79.0: worn (Wear.ts): the frames grimy, the wood scuffed, the shutters rusting at the edges.
    wearRoles(this.mats);
    applyWear(this.shutter, 'paint', 0.6);
    applyWear(this.canvas, 'cloth', 0.7);
  }

  get ready() {
    return !!this.kit;
  }

  /**
   * One slot: its base centre on the wall at `base`, turned by `ry` (its front out along the face's
   * normal), `h` tall (3.8 on the street, 2.9 on the walkway level); `awning` over a shop.
   */
  lay(kind: StoreKind, base: THREE.Vector3, ry: number, h: number, awning: boolean) {
    if (!this.kit) return false;
    const key = hash(base.x, base.y, base.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const sy = h / 3.8;
    const M = new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, sy, 1));
    // The room behind the glass (a shutter has none: its curtain covers the slot).
    let room: Room | null = null;
    if (kind === 'shop') room = SHOP_ROOMS[key % SHOP_ROOMS.length];
    else if (kind === 'izakaya') room = key % 3 === 0 ? 'ramen' : 'izakaya';
    else if (kind === 'door') room = 'lobby';
    if (room) {
      const g = roomUV(this.plane, ROOMS.indexOf(room), h);
      g.translate(0, 1.9, 0);
      this.b.addMatrix(g, this.glass, new THREE.Matrix4().compose(base.clone().add(new THREE.Vector3(0, 0, 0.02).applyQuaternion(q)), q, new THREE.Vector3(1, sy, 1)));
      g.dispose();
      this.stats.rooms[room] = (this.stats.rooms[room] ?? 0) + 1;
    }
    const trade: SignTrade = kind === 'shutter' ? 'closed' : kind === 'door' ? 'building' : room!;
    const n = (this.handed[trade] = (this.handed[trade] ?? -1) + 1) + (key % 3);
    for (const p of this.kit[NODE[kind]]) {
      let geo = p.geo, mat: THREE.Material | undefined = this.mats[p.role];
      if (p.role === 'signface') {
        geo = planarInto(p.geo, signCell(trade, n));
        mat = kind === 'shutter' ? this.signOff : this.signOn;
      } else if (p.role === 'dir') {
        const c = key % 4, u = (c % 2) / 2, v = Math.floor(c / 2) / 2;
        geo = planarInto(p.geo, [u, 1 - v - 0.5, u + 0.5, 1 - v]);
        mat = this.dir;
      } else if (p.role === 'noren') {
        // The ramen shop's red cloth, else indigo or white.
        const c = room === 'ramen' ? 1 : key % 2 === 0 ? 0 : 2;
        geo = planarInto(p.geo, [c / 3, 0, (c + 1) / 3, 1]);
        mat = this.noren;
      } else if (p.role === 'shutter') {
        const c = key % 3;
        geo = planarInto(p.geo, [c / 3, 0, (c + 1) / 3, 1]);
        mat = this.shutter;
      }
      if (!mat) continue;
      this.b.addMatrix(geo, mat, M);
      if (geo !== p.geo) geo.dispose();
    }
    if (awning && this.kit.sf_awning) {
      const c = key % 3;
      for (const p of this.kit.sf_awning) {
        if (p.role === 'canvas') {
          const g = planarInto(p.geo, [c / 3, 0, (c + 1) / 3, 1]);
          this.b.addMatrix(g, this.canvas, M);
          g.dispose();
        } else if (this.mats[p.role]) this.b.addMatrix(p.geo, this.mats[p.role], M);
      }
    }
    this.stats.slots++;
    return true;
  }
}
