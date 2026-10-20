import * as THREE from 'three';
import type { Nav } from '../enemies/Nav';
import type { CollisionWorld } from '../world/Collision';
import { floorBand, type FloorBand } from '../stealth/PlayerIntel';

const BODY = 1;
/** Seconds between route recomputations. */
const EVERY = 0.5;
/** How much of the route the minimap draws (metres). */
const SHOW = 90;

export interface GuidePoint {
  pos: THREE.Vector3;
  /** What to call it: the objective's own name, or how to change level here. */
  label: string;
  /** True when this is the objective itself (not a waypoint towards it). */
  final: boolean;
  /** Level change at a waypoint: +1 up, -1 down, 0 none. */
  climb: -1 | 0 | 1;
  /** Short "how": METRO ENTRANCE / STAIRS UP (waypoints only). */
  via?: string;
}

const ORDER: FloorBand[] = ['under', 'street', 'deck', 'roof'];
const FLOOR_NAME: Record<FloorBand, string> = { under: 'METRO', street: 'STREET', deck: 'WALKWAY', roof: 'ROOFTOP' };

/**
 * Objective navigation from the same waypoint graph the guards use. If the objective is on another
 * level, the marker points at where the route changes level (a stair or metro entrance), never
 * through the floor; on the same level it points at the objective. The minimap gets the first
 * stretch of the route so it can draw a path along real streets and stairs.
 */
export class Guidance {
  guide: GuidePoint | null = null;
  /** Route polyline for the minimap (world points, starting at the player). */
  path: THREE.Vector3[] = [];
  /** Total route length in metres (-1 without a route). */
  routeLength = -1;
  private t = 0;
  private target: THREE.Vector3 | null = null;
  private targetName = '';

  constructor(private nav: Nav, private col: CollisionWorld) {}

  setTarget(p: THREE.Vector3 | null, name: string) {
    this.target = p ? p.clone() : null;
    this.targetName = name;
    this.t = 0;
    if (!p) {
      this.guide = null;
      this.path = [];
      this.routeLength = -1;
    }
  }

  update(player: THREE.Vector3, dt: number) {
    if (!this.target) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = EVERY;
    const tgt = this.target;
    const from = new THREE.Vector3(player.x, player.y + BODY, player.z);
    const ids = this.nav.route(from, new THREE.Vector3(tgt.x, tgt.y + BODY, tgt.z));
    const nodes = ids.map((i) => this.nav.nodes[i].clone().setY(this.nav.nodes[i].y - BODY));
    // Nodes he is already standing at (e.g. the foot of the stair he's on) are behind him, not ahead.
    while (nodes.length > 1 && Math.hypot(nodes[0].x - player.x, nodes[0].z - player.z) < 2 && Math.abs(nodes[0].y - player.y) < 1.5) nodes.shift();
    const pts = [player.clone(), ...nodes, tgt.clone()];
    if (!ids.length) {
      // No route (e.g. a shuttered station): point at the objective itself.
      this.path = [];
      this.routeLength = -1;
      this.guide = { pos: tgt.clone(), label: this.targetName, final: true, climb: 0 };
      return;
    }
    let len = 0;
    this.path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      len += pts[i].distanceTo(pts[i - 1]);
      if (len <= SHOW) this.path.push(pts[i]);
    }
    this.routeLength = len;
    // First level change along the route: the bottom (or top) of that stair is the waypoint.
    const pb = floorBand(player.y);
    const tb = floorBand(tgt.y);
    let guide: GuidePoint = { pos: tgt.clone(), label: this.targetName, final: true, climb: 0 };
    if (pb !== tb) {
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].y - player.y) > 1.2) {
          const at = pts[i - 1];
          const up = pts[i].y > player.y;
          // The level this stair arrives at: the first flat stretch after it.
          let j = i;
          while (j + 1 < pts.length && Math.abs(pts[j + 1].y - pts[j].y) > 0.3) j++;
          const arrives = floorBand(pts[j].y);
          // A metro entrance: going down through a stairwell opening in the street.
          const metro = !up && pts.slice(i - 1, j + 1).some((q) => this.col.inHole(q.x, q.z));
          const via = metro ? 'METRO ENTRANCE' : `STAIRS ${up ? 'UP' : 'DOWN'}`;
          guide = {
            // Already on the stair: point at where it arrives instead of at his feet.
            pos: (i === 1 ? pts[j] : at).clone(),
            label: metro ? via : `${via} · ${FLOOR_NAME[arrives]}`,
            via,
            final: false,
            climb: up ? 1 : -1,
          };
          break;
        }
      }
    }
    this.guide = guide;
  }

  /** "▲ ROOFTOP" style hint for the target's level relative to the player's. */
  static floorHint(player: THREE.Vector3, target: THREE.Vector3) {
    const a = ORDER.indexOf(floorBand(player.y));
    const b = ORDER.indexOf(floorBand(target.y));
    if (a === b) return '';
    return `${b > a ? '▲' : '▼'} ${FLOOR_NAME[ORDER[b]]}`;
  }
}
