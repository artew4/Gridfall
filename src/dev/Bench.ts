import * as THREE from 'three';
import type { Game } from '../core/Game';
import { probe } from './PerfProbe';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEV only. The fixed benchmark used to compare versions: the same camera placements and events in
 * the same order, at the current graphics preset. Each scenario is measured for `seconds` after a
 * short settle. Results include FPS, average/P95/P99 frame time, CPU and GPU ms and busy share,
 * draw calls, triangles, heap and collision-query cost.
 */
export async function bench(game: Game, seconds = 3) {
  const dev = (window as unknown as { __dev: { start(m: string): void; god(): void; noGuards(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void } }).__dev;
  const out: Record<string, unknown> = {};
  const m = async (name: string) => {
    await wait(700);
    out[name] = await probe(game, seconds);
  };
  dev.start('story');
  dev.god();
  dev.noGuards();
  game.security.alert.reset();
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  await m('plaza');
  dev.tp(30, 8.5, 9, 0, 0);
  dev.look(10, 6, -4);
  await m('rooftop');
  game.setStationOpen(true);
  dev.tp(0, -6, 21, 0, 0);
  dev.look(0, -5, 28);
  await m('metroConcourse');
  dev.tp(-6, -6, 30.5, 0, 0);
  dev.look(6, -5, 33.5);
  await m('platform');
  // A train through the station (the real timetable, forced to run now).
  game.rail.tt.now = (game.rail.tt.upcoming(1)[0]?.time ?? game.rail.tt.now) - 0.2;
  await m('platformTrain');
  dev.tp(0, 0, -19, 0, 0);
  dev.look(-20, 9, -24);
  (game as unknown as { train: { startNow(d: number, x: number, s: number): void } }).train.startNow(1, -160, 14);
  await m('overpassTrain');
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  game.weapon.setHolstered(false, true);
  game.security.ambush(new THREE.Vector3(0, 0, 4), 4);
  await wait(1500);
  await m('pursuit');
  for (let i = 0; i < 8; i++) {
    dev.shoot();
    await wait(120);
  }
  game.security.ambush(new THREE.Vector3(4, 0, 4), 6);
  await m('firefight');
  dev.noGuards();
  game.security.alert.reset();
  return out;
}
