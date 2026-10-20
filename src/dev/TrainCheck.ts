import type { Game } from '../core/Game';
import { DOOR_XS, SCREEN_Z, UG } from '../world/Metro';
import type { Input } from '../core/Input';

type Keys = string[];
const input = (keys: Keys) => {
  const set = new Set(keys);
  return { keys: set, pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, key: (c: string) => set.has(c) } as unknown as Input;
};

/**
 * DEV only. The train and the platform doors with the real controller, the real collision and (for the
 * door scenarios) the real Rail and timetable:
 *  - boarding: every door, 7 approach angles, walk and sprint, 20 and 60 FPS, doors open → must end
 *    inside the car; never in the track pit, never inside geometry;
 *  - closed doors: the same approaches with the doors shut → must never get into the car or the pit;
 *  - riding: jumping and walking inside a car while it pulls out → stays inside, carried along;
 *  - doorway: someone standing in each doorway as the doors close (stays / steps back / boards) →
 *    never shut in, never in the pit, and the train leaves soon after the doorway is clear.
 * Leaves the game where it found it (rail reset, player restored).
 */
export function checkTrain(game: Game) {
  const t0 = performance.now();
  const g = game;
  const T = g.tokyo.rail.train;
  const M = g.tokyo.district.metro;
  const P = g.player;
  const saved = { pos: P.pos.clone(), yaw: P.yaw };
  const fails: Record<string, unknown>[] = [];
  const inPit = () => P.pos.y < UG - 0.5;
  const stuck = () => g.col.blocked(P.pos, P.radius - 0.02);
  const run = (keys: Keys, seconds: number, dt: number, each?: (t: number) => void) => {
    const inp = input(keys);
    for (let t = 0; t < seconds; t += dt) {
      each?.(t);
      P.update(dt, inp, true, t);
      if (inPit()) return 'track pit';
    }
    return stuck() ? 'inside geometry' : null;
  };

  // ---------------------------------------------------------------- boarding and closed doors
  let boardRuns = 0;
  for (const open of [true, false]) {
    for (const x of DOOR_XS) {
      for (const a of [-45, -30, -15, 0, 15, 30, 45]) {
        for (const keys of [['KeyW'], ['KeyW', 'ShiftLeft']]) {
          for (const dt of [1 / 20, 1 / 60]) {
            boardRuns++;
            T.set(0, open ? 1 : 0, true, 1);
            M.setDoors(open ? 1 : 0);
            const yaw = Math.PI - (a * Math.PI) / 180; // facing +z (towards the train), turned by a
            P.reset(x + Math.tan((a * Math.PI) / 180) * 2.5, SCREEN_Z - 2.5, yaw, UG);
            const bad = run(keys, 1.6, dt);
            const inside = T.inside(P.pos);
            const why = bad ?? (open && !inside ? 'did not get in' : !open && inside ? 'got through closed doors' : null);
            if (why) fails.push({ test: open ? 'board' : 'closed', why, door: x, angle: a, keys: keys.join('+'), fps: Math.round(1 / dt), pos: P.pos.toArray().map((q) => +q.toFixed(2)) });
          }
        }
      }
    }
  }
  const boardFails = fails;

  // ---------------------------------------------------------------- riding a departing car
  const rideFails: Record<string, unknown>[] = [];
  let rideRuns = 0;
  for (const x of DOOR_XS) {
    for (const keys of [[], ['KeyW'], ['KeyD', 'ShiftLeft']] as Keys[]) {
      rideRuns++;
      T.set(0, 0, true, 1);
      P.reset(x, 35, 0, UG);
      let tx = 0;
      const bad = run(keys, 4, 1 / 60, (t) => {
        // Pull out like Rail does (x = RUN_IN u²) and carry the rider; jump every 0.7 s.
        const nx = 170 * (t / 9) ** 2;
        if (T.inside(P.pos)) P.pos.x += nx - tx;
        tx = nx;
        T.set(nx, 0, true, 1);
        if (P.onGround && Math.floor(t / 0.7) !== Math.floor((t - 1 / 60) / 0.7)) P.vel.y = 4.8;
      });
      if (bad || !T.inside(P.pos)) rideFails.push({ why: bad ?? 'left the car', door: x, keys: keys.join('+'), pos: P.pos.toArray().map((q) => +q.toFixed(2)) });
    }
  }

  // ---------------------------------------------------------------- doorway obstruction (real Rail)
  const R = g.tokyo.rail;
  const doorFails: Record<string, unknown>[] = [];
  const doorRuns: Record<string, unknown>[] = [];
  const onEvent = R.onEvent;
  for (const x of DOOR_XS) {
    for (const plan of ['stays', 'stepsBack', 'boardsWhileClosing'] as const) {
      R.reset();
      const s = R.tt.services.find((o) => o.kind === 'local' && o.time > R.tt.now + 1)!;
      R.tt.now = s.time - (12 * 4) / 60; // 12 real seconds before arrival
      const ev: string[] = [];
      let aboard: boolean | null = null;
      R.onEvent = (e) => {
        ev.push(e.type);
        if (e.type === 'doorsClosed') aboard = e.aboard;
      };
      P.reset(x, 31.5, Math.PI, UG);
      const dt = 1 / 60;
      const enter = plan === 'boardsWhileClosing' ? 12 + 24 - 2.2 : 16;
      let departT = -1;
      let shutIn = false;
      let pit = false;
      for (let t = 0; t < 120; t += dt) {
        if (Math.abs(t - enter) < dt / 2) P.pos.set(x, UG, SCREEN_Z + 0.4);
        const keys = plan === 'stepsBack' && t > 40 && t < 41 ? ['KeyS'] : plan === 'boardsWhileClosing' && t > 40 && t < 40.6 ? ['KeyW'] : [];
        R.update(dt, P.pos, false);
        if (departT < 0 && ev.includes('depart')) departT = t;
        // Stop before the simulated train runs off the end with a rider (in play, the mission ends it).
        if (plan === 'boardsWhileClosing' && departT > 0) break;
        P.update(dt, input(keys), true, t);
        if (inPit()) pit = true;
        // Shut in: inside the pocket with the screen-door leaves closed and the car doors closed.
        const pocket = P.pos.z > SCREEN_Z + 0.05 && P.pos.z < SCREEN_Z + 0.75 && M.doorwayAt(P.pos) >= 0;
        if (pocket && T.doorK === 0 && Math.abs(T.x) < 0.01 && g.col.blocked(P.pos.clone().setZ(P.pos.z - 0.4), 0.3)) shutIn = true;
      }
      const r = { door: x, plan, obstructed: ev.filter((e) => e === 'obstructed').length, departT: +departT.toFixed(1), aboard, pit, shutIn };
      doorRuns.push(r);
      const expectAboard = plan === 'boardsWhileClosing';
      if (pit || shutIn || departT < 0 || (expectAboard && aboard !== true) || (plan === 'stepsBack' && (departT > 41 + 3 + 3 + 2 || !ev.includes('obstructed')))) doorFails.push(r);
    }
  }
  R.onEvent = onEvent;
  R.reset();
  P.reset(saved.pos.x, saved.pos.z, saved.yaw, saved.pos.y);
  return {
    ms: Math.round(performance.now() - t0),
    boarding: { runs: boardRuns, failures: boardFails.length, examples: boardFails.slice(0, 10) },
    riding: { runs: rideRuns, failures: rideFails.length, examples: rideFails.slice(0, 5) },
    doorway: { runs: doorRuns.length, failures: doorFails.length, examples: doorFails.slice(0, 6), sample: doorRuns.slice(0, 3) },
  };
}
