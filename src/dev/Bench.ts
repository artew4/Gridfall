import * as THREE from 'three';
import type { Game } from '../core/Game';
import { probe } from './PerfProbe';
import type { Pipeline } from '../core/Renderer';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * DEV only. The fixed benchmark used to compare versions: the same camera placements and events in
 * the same order, at the current graphics preset. Each scenario is measured for `seconds` after a
 * short settle. Results include FPS, average/P95/P99 frame time, CPU and GPU ms and busy share,
 * draw calls, triangles, heap and collision-query cost.
 */
export async function bench(game: Game, seconds = 3, opts: { pipelines?: Pipeline[] } = {}) {
  const dev = (window as unknown as { __dev: { start(m: string): void; god(): void; noGuards(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void } }).__dev;
  const out: Record<string, unknown> = {};
  const valid = () => document.hasFocus() && !document.hidden && game.state === 'play';
  /**
   * One measurement that only counts if the window stayed focused, visible and in play the whole
   * time (an unfocused window is capped lower and a hidden one pauses: those numbers measure the
   * power policy, not rendering). Up to three tries.
   */
  const one = async () => {
    let r: Record<string, unknown> = {};
    for (let k = 0; k < 3; k++) {
      // A released pointer lock or a hidden tab pauses the game (nothing is drawn): resume it.
      if (game.state === 'paused') (dev as unknown as { lock(): void }).lock();
      await wait(700);
      const ok0 = valid();
      r = (await probe(game, seconds)) as unknown as Record<string, unknown>;
      if (ok0 && valid()) return { ...r, valid: true, tries: k + 1 };
    }
    return { ...r, valid: false, tries: 3 };
  };
  let turn = 0;
  const m = async (name: string) => {
    if (!opts.pipelines) {
      out[name] = await one();
      return;
    }
    // Every pipeline at the same placement, the order rotated per scenario so drift (heat, battery)
    // doesn't favour one of them.
    const ps = opts.pipelines;
    const res: Record<string, unknown> = {};
    for (let i = 0; i < ps.length; i++) {
      const p = ps[(i + turn) % ps.length];
      game.setPipeline(p);
      res[p] = await one();
    }
    turn++;
    game.setPipeline('v4');
    out[name] = res;
  };
  if (game.setting === 'desert') return benchDesert(game, dev, m, out);
  if (game.setting === 'jungle') return benchJungle(game, dev, m, out);
  dev.start('story');
  dev.god();
  dev.noGuards();
  game.tokyo.security.alert.reset();
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  await m('plaza');
  dev.tp(30, 8.5, 9, 0, 0);
  dev.look(10, 6, -4);
  await m('rooftop');
  game.tokyo.setStationOpen(true);
  dev.tp(0, -6, 21, 0, 0);
  dev.look(0, -5, 28);
  await m('metroConcourse');
  dev.tp(-6, -6, 30.5, 0, 0);
  dev.look(6, -5, 33.5);
  await m('platform');
  // A train through the station (the real timetable, forced to run now).
  game.tokyo.rail.tt.now = (game.tokyo.rail.tt.upcoming(1)[0]?.time ?? game.tokyo.rail.tt.now) - 0.2;
  await m('platformTrain');
  dev.tp(0, 0, -19, 0, 0);
  dev.look(-20, 9, -24);
  game.tokyo.train.startNow(1, -160, 14);
  await m('overpassTrain');
  dev.tp(0, 0, 14, 0, 0);
  dev.look(0, 1, 0);
  game.weapon.setHolstered(false, true);
  game.tokyo.security.ambush(new THREE.Vector3(0, 0, 4), 4);
  await wait(1500);
  await m('pursuit');
  for (let i = 0; i < 8; i++) {
    dev.shoot();
    await wait(120);
  }
  game.tokyo.security.ambush(new THREE.Vector3(4, 0, 4), 6);
  await m('firefight');
  dev.noGuards();
  game.tokyo.security.alert.reset();
  return out;
}

type Dev = { start(m: string, s?: string): void; god(): void; tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void; look(x: number, y: number, z: number): void; shoot(): void };

/** Desert Outpost: calm and storm, outside, inside, the long view, a fight in the dust. */
async function benchDesert(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  const desert = game.level as unknown as { storm: { clock: { set(p: string, i?: number): void } } };
  dev.start('arcade', 'desert');
  dev.god();
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  desert.storm.clock.set('calm', 0.06);
  dev.tp(-3, 0, 14, 0, 0);
  dev.look(10, 2, -12);
  await m('yardCalm');
  dev.tp(24.5, 3.25, 12.5, 0, 0);
  dev.look(-30, 0, -40);
  await m('towerView');
  desert.storm.clock.set('peak', 1);
  dev.tp(-3, 0, 14, 0, 0);
  dev.look(10, 2, -12);
  await m('yardStorm');
  dev.tp(-21, 0.12, -14.8, 0, 0);
  dev.look(-22.8, 1.2, -6);
  await m('interiorStorm');
  dev.tp(50, 2, 40, 0, 0);
  dev.look(0, 2, 0);
  await m('dunesStorm');
  // A wave in the dust: enemies spawned around and closing in.
  dev.tp(0, 0, 8, 0, 0);
  dev.look(0, 1.5, -10);
  game.waves.startNext();
  game.waves.startNext();
  game.waves.startNext();
  await new Promise((r) => setTimeout(r, 4000));
  for (let i = 0; i < 6; i++) {
    dev.shoot();
    await new Promise((r) => setTimeout(r, 120));
  }
  await m('fightStorm');
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  desert.storm.clock.set('calm', 0.06);
  return out;
}

/**
 * Deep Jungle (3.7, Firebase Viper): the road at the start looking up to the gate, deep in the
 * undergrowth looking through it (the worst case for foliage), the yard just inside the gate (the
 * new compound in view), inside the barracks, the watchtower overlooking the compound and the
 * forest (most geometry at once), and a shotgun fight in the yard with waves closing in.
 */
async function benchJungle(game: Game, dev: Dev, m: (name: string) => Promise<void>, out: Record<string, unknown>) {
  dev.start('arcade', 'jungle');
  dev.god();
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  const h = (x: number, z: number) => game.col.terrain?.height(x, z) ?? 0;
  const st = game.level.data.start;
  dev.tp(st.x, 0, st.z, st.yaw, 0);
  dev.look(0, 3, 10);
  await m('roadApproach');
  dev.tp(-46, h(-46, -4), -4, 0, 0);
  dev.look(-28, 2, -14);
  await m('undergrowth');
  dev.tp(0, 0, 5.5, 0, 0);
  dev.look(-4, 1.5, -25);
  await m('yard');
  dev.tp(-17.3, 0.12, -29.2, 0, 0);
  dev.look(-23, 1.4, -33);
  await m('barracks');
  dev.tp(17.2, 4.5, 3.2, 0, 0);
  dev.look(-10, 0, -25);
  await m('watchtower');
  dev.tp(0, 0, -11, 0, 0);
  dev.look(0, 1.5, 10);
  game.waves.startNext();
  game.waves.startNext();
  game.waves.startNext();
  await new Promise((r) => setTimeout(r, 5000));
  const w = game.weapon as unknown as { tryFire(): boolean };
  const g = game as unknown as { shoot(): void };
  for (let i = 0; i < 4; i++) {
    if (w.tryFire()) g.shoot();
    await new Promise((r) => setTimeout(r, 900));
  }
  await m('fight');
  game.waves.reset(game.scene);
  game.waves.state = 'idle';
  return out;
}
