import type * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

/*
  52.0, the level's precomputed data cached in the browser (IndexedDB): the nav graph's links (half to
  most of a map's build: Deep Jungle 0.6 s of rays and floor samples), the arena's vault links (built
  at a match's start) and the cover spots (the Desert 0.46 s). They follow from the level's geometry
  alone, so each entry carries a fingerprint of everything they were computed from (every collider,
  the holes, the terrain sampled on a grid, the hand graph) and of the code that computed them
  (`ALGO`: bump it with any change to Nav's or CoverSpots' rules). A fingerprint that differs is a
  miss, and the next build stores fresh data: a map edit never loads a stale graph.

  Everything here fails soft: no IndexedDB (a private window, storage blocked), an error, a slow
  open: a miss, and the level computes its data as before.
*/

/** Bump when Nav's linking or CoverSpots' rules change (the geometry is fingerprinted on its own). */
export const ALGO = 'nav-52.0';

const DB = 'gridfall-cache';
const STORE = 'level';

/** FNV-1a over 32-bit words, two lanes (a 64-bit-ish key). */
class Hash {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9;
  num(v: number) {
    const k = Number.isFinite(v) ? Math.round(v * 1000) | 0 : v === Infinity ? 0x7fffffff : v === -Infinity ? -0x7fffffff : 0x55555555;
    this.a = Math.imul(this.a ^ k, 0x01000193);
    this.b = Math.imul(this.b ^ (k + 0x27d4eb2d), 0x01000193);
    return this;
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.num(s.charCodeAt(i) / 1000);
    return this;
  }
  get hex() {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0');
  }
}

/** The fingerprint of a level's collision world (and anything else given) for the cache's key. */
export function fingerprint(col: CollisionWorld, extra: (h: { num(v: number): unknown; str(s: string): unknown }) => void = () => {}) {
  const h = new Hash().str(ALGO);
  h.num(col.colliders.length);
  for (const c of col.colliders) {
    h.str(c.kind).num(c.min.x).num(c.min.y).num(c.min.z).num(c.max.x).num(c.max.y).num(c.max.z);
    h.num((c.solid ? 1 : 0) + (c.ray ? 2 : 0) + (c.floor ? 4 : 0) + (c.vault ? 8 : 0) + (c.dynamic ? 16 : 0));
    if (c.kind === 'ramp') h.str(c.axis ?? '').num(c.h0 ?? 0).num(c.h1 ?? 0);
    if (c.kind === 'cyl') h.num(c.cx ?? 0).num(c.cz ?? 0).num(c.r ?? 0);
  }
  for (const o of col.holes) h.num(o.x0).num(o.z0).num(o.x1).num(o.z1);
  const t = col.terrain;
  if (t) for (let x = -120; x <= 120; x += 7.5) for (let z = -120; z <= 120; z += 7.5) h.num(t.height(x, z));
  extra(h);
  return h.hex;
}

/** The hand-authored graph's part of a fingerprint. */
export function hashLayout(h: { num(v: number): unknown }, nodes: readonly THREE.Vector3[], links: readonly (readonly [number, number])[], more: number[] = []) {
  h.num(nodes.length);
  for (const p of nodes) h.num(p.x), h.num(p.y), h.num(p.z);
  h.num(links.length);
  for (const [a, b] of links) h.num(a), h.num(b);
  for (const v of more) h.num(v);
}

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
      // A store that doesn't answer in time is no store.
      setTimeout(() => resolve(null), 1500);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

/** The value stored under `key` if it was computed for fingerprint `fp`, else null. */
export async function cacheGet<T>(key: string, fp: string): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => {
        const v = r.result as { fp: string; v: T } | undefined;
        resolve(v && v.fp === fp ? v.v : null);
      };
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Store `v` under `key` for fingerprint `fp` (in the background; a failure is ignored). */
export function cachePut<T>(key: string, fp: string, v: T) {
  void db().then((d) => {
    if (!d) return;
    try {
      d.transaction(STORE, 'readwrite').objectStore(STORE).put({ fp, v }, key);
    } catch {
      /* storage full or blocked: computed again next time */
    }
  });
}
