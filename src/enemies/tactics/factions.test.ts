import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThinkScheduler } from './Scheduler';
import { Squad, createTac, nearestLane, type SquadCtx, type TacAgent } from './Squad';
import { HUMAN, HumanObserver } from './Human';
import { CollisionWorld } from '../../world/Collision';
import { Nav } from '../Nav';
import type { Combatant, TeamId } from '../../combat/Team';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function agent(kind: 'runner' | 'gunner', pos: THREE.Vector3, team: TeamId = 'alpha', name = ''): TacAgent & { decided: number } {
  const a = { kind, pos, alive: true, perch: null, team, name, look: { voice: 'human' as const }, decided: 0 } as unknown as TacAgent & { decided: number };
  a.tac = createTac(a);
  a.decide = () => {
    a.decided++;
  };
  return a;
}

/** A hostile or the human: just what the squad reads. */
function unit(pos: THREE.Vector3, team: TeamId, name: string, isPlayer = false): Combatant & { alive: boolean } {
  return {
    uid: Math.floor(Math.random() * 1e6), team, name, isPlayer, pos, vel: v(0, 0, 0), alive: true, radius: 0.35, headY: 1.4, chestY: 1.25,
    reloading: false, hpFrac: 1, pressureT: -Infinity, facing: (o: THREE.Vector2) => o.set(0, -1), hurt: () => false,
  };
}

function squadCtx(): SquadCtx {
  const col = new CollisionWorld();
  const nodes: THREE.Vector3[] = [];
  for (let x = -24; x <= 24; x += 6) for (let z = -24; z <= 24; z += 6) nodes.push(v(x, 0, z));
  return { time: 0, col, nav: new Nav(col, { nodes, links: [] }), coverPoints: [], bounds: new THREE.Box2(new THREE.Vector2(-30, -30), new THREE.Vector2(30, 30)), difficulty: 0 };
}

describe('Human observer (the ALPHA director reads the player)', () => {
  const front = new THREE.Vector2(0, 1); // the squad is south (+z) of the enemy
  const enemy = v(0, 0, 0);
  /** Feed a track: positions at 0.25 s steps from `from` moving at `vel`, shots at `rate` per second. */
  const run = (o: HumanObserver, from: THREE.Vector3, vel: THREE.Vector3, rate: number, secs = 3, hp = 1) => {
    let t = 0;
    const p = from.clone();
    let last = '';
    for (; t <= secs; t += 0.25) {
      o.sample(t, p);
      if (rate > 0) for (let k = 0; k < rate / 4; k++) o.shot(t);
      if (Math.round(t * 100) % 40 === 0 || t + 0.25 > secs) last = o.classify(t, true, hp, p, enemy, front);
      p.addScaledVector(vel, 0.25);
    }
    return last;
  };

  it('steady fire from one place is suppressing; standing quietly is holding', () => {
    expect(run(new HumanObserver(), v(0, 0, 20), v(0, 0, 0), 4)).toBe('suppressing');
    expect(run(new HumanObserver(), v(0, 0, 20), v(0, 0, 0), 0)).toBe('holding');
  });

  it('closing on the enemy is pushing; working round one side is flanking, with the side', () => {
    expect(run(new HumanObserver(), v(0, 0, 25), v(0, 0, -3.5), 0)).toBe('pushing');
    const o = new HumanObserver();
    // Moving -x across the line to the enemy: he ends up on the squad's left (+1 convention).
    expect(run(o, v(4, 0, 20), v(-3.5, 0, 0), 0)).toBe('flanking');
    expect(o.side).toBe(1);
  });

  it('circling the enemy at a constant distance is flanking, not falling back (live-run regression)', () => {
    const o = new HumanObserver();
    let last = '';
    for (let t = 0; t <= 3; t += 0.25) {
      const a = 1.2 - t * 0.27; // ~4 m/s round a 15 m circle
      const p = v(Math.sin(a) * 15, 0, Math.cos(a) * 15);
      o.sample(t, p);
      if (Math.round(t * 100) % 40 === 0 || t + 0.25 > 3) last = o.classify(t, true, 1, p, enemy, front);
    }
    expect(last).toBe('flanking');
  });

  it('falling back (or hurt and not advancing) is retreating, adopted at once; dead is down', () => {
    const o = new HumanObserver();
    o.sample(0, v(0, 0, 10));
    o.sample(1, v(0, 0, 14));
    expect(o.classify(1, true, 1, v(0, 0, 14), enemy, front)).toBe('retreating');
    expect(run(new HumanObserver(), v(0, 0, 20), v(0, 0, 0), 0, 3, 0.2)).toBe('retreating');
    expect(o.classify(2, false, 0, v(0, 0, 14), enemy, front)).toBe('down');
  });

  it('a new style must hold for two judgements before it is adopted (no flicker)', () => {
    const o = new HumanObserver();
    for (let i = 0; i < 12; i++) o.shot(0.1 * i);
    o.sample(0, v(0, 0, 20));
    o.sample(1.2, v(0, 0, 20));
    expect(o.classify(1.2, true, 1, v(0, 0, 20), enemy, front)).toBe('holding');
    expect(o.classify(1.6, true, 1, v(0, 0, 20), enemy, front)).toBe('suppressing');
    expect(HUMAN.confirm).toBe(2);
  });
});

describe('ALPHA director roles round the human', () => {
  /** Five gunners all on the squad's left of the enemy, engaged, the human given a style. */
  const setup = (style: 'holding' | 'suppressing' | 'pushing' | 'flanking', side = 0) => {
    const sq = new Squad({ team: 'alpha' });
    const ctx = squadCtx();
    const gs = [v(-8, 0, 15), v(-9, 0, 16), v(-7, 0, 14), v(-10, 0, 18), v(-6, 0, 20)].map((p) => agent('gunner', p));
    const human = unit(v(0, 0, 18), 'alpha', 'YOU', true);
    sq.human = human;
    sq.update(ctx, gs);
    sq.sighting(gs[0], v(0, 0, 0), v(0, 0, 0), unit(v(0, 0, 0), 'omega', 'X'));
    // Force the inferred style (the observer is tested above).
    sq.humanObs.classify = () => {
      sq.humanObs.side = side;
      return style;
    };
    sq.assignRoles(ctx);
    return { sq, gs };
  };
  const count = (gs: TacAgent[], role: string) => gs.filter((g) => g.tac.role === role).length;

  it('he holds: the usual two suppressors', () => {
    expect(count(setup('holding').gs, 'suppressor')).toBe(2);
  });

  it('he suppresses: one bot suppressor fewer, the rest go round', () => {
    const { gs } = setup('suppressing');
    expect(count(gs, 'suppressor')).toBe(1);
    expect(count(gs, 'flanker')).toBe(4);
  });

  it('he pushes: one more gun covers his advance', () => {
    expect(count(setup('pushing').gs, 'suppressor')).toBe(3);
  });

  it('he flanks left: he counts on the left, so the bot flankers lean right', () => {
    const { gs } = setup('flanking', 1);
    const L = gs.filter((g) => g.tac.role === 'flanker' && g.tac.side > 0).length;
    const R = gs.filter((g) => g.tac.role === 'flanker' && g.tac.side < 0).length;
    expect(L + 1 - R).toBeLessThanOrEqual(1);
    expect(R).toBeGreaterThan(L);
  });
});

describe('Lanes', () => {
  const lanes = [
    [v(-20, 0, 25), v(-20, 0, -25)],
    [v(0, 0, 25), v(0, 0, -25)],
    [v(20, 0, 25), v(20, 0, -25)],
  ];
  it('a fresh bot takes the lane furthest below its share, counting the human where he is', () => {
    const sq = new Squad({ team: 'alpha' });
    const ctx = { ...squadCtx(), lanes };
    sq.human = unit(v(-19, 0, 5), 'alpha', 'YOU', true);
    const a = agent('gunner', v(0, 0, 25)), b = agent('gunner', v(0, 0, 25)), c = agent('gunner', v(0, 0, 25));
    sq.update(ctx, [a, b, c]);
    const got = [a, b, c].map((x) => x.tac.lane).sort();
    // Human on the left: the bots take centre, centre/right, right — nobody else goes left.
    expect(got).not.toContain(0);
    expect(nearestLane(lanes, v(19, 0, 0))).toBe(2);
  });
});

describe('Contacts and focus (several hostiles)', () => {
  it('keeps the focus while it is in sight, moves it to a hostile in sight once the focus is gone a moment', () => {
    const sq = new Squad({ team: 'omega' });
    const ctx = squadCtx();
    const g = agent('gunner', v(0, 0, 15), 'omega');
    const A = unit(v(0, 0, 0), 'alpha', 'A'), B = unit(v(10, 0, 0), 'alpha', 'B');
    sq.update(ctx, [g]);
    sq.sighting(g, A.pos, A.vel, A);
    expect(sq.focus?.who).toBe(A);
    ctx.time = 0.5;
    sq.update(ctx, [g]);
    sq.sighting(g, B.pos, B.vel, B);
    expect(sq.focus?.who).toBe(A);
    ctx.time = 2;
    sq.update(ctx, [g]);
    sq.sighting(g, B.pos, B.vel, B);
    expect(sq.focus?.who).toBe(B);
    expect(sq.lkp!.distanceTo(B.pos)).toBeLessThan(1e-6);
  });

  it('a dead focus: fight the next known hostile; none left: stand down', () => {
    const sq = new Squad({ team: 'omega' });
    const ctx = squadCtx();
    const g = agent('gunner', v(0, 0, 15), 'omega');
    const A = unit(v(0, 0, 0), 'alpha', 'A'), B = unit(v(10, 0, 0), 'alpha', 'B');
    sq.update(ctx, [g]);
    sq.sighting(g, B.pos, B.vel, B);
    sq.sighting(g, A.pos, A.vel, A);
    A.alive = false;
    sq.hostileDied(A, g);
    expect(sq.focus?.who).toBe(B);
    B.alive = false;
    sq.hostileDied(B, g);
    expect(sq.focus).toBe(null);
    expect(sq.mode).toBe('idle');
  });

  it('an anonymous report is adopted by the first named sighting (survival: one hostile, one contact)', () => {
    const sq = new Squad();
    const ctx = squadCtx();
    const g = agent('gunner', v(0, 0, 15), 'omega');
    sq.update(ctx, [g]);
    sq.report(v(0, 0, 0), 0);
    const P = unit(v(1, 0, 1), 'alpha', 'YOU', true);
    sq.sighting(g, P.pos, P.vel, P);
    expect(sq.contacts.size).toBe(1);
    expect(sq.focus?.who).toBe(P);
  });
});

describe('Two directors, one scheduler', () => {
  it('one frame budget across both teams, most overdue first, neither team starved', () => {
    const sched = new ThinkScheduler();
    const A = new Squad({ team: 'alpha', sched }), O = new Squad({ team: 'omega', sched });
    const ctx = squadCtx();
    const as = Array.from({ length: 4 }, (_, i) => agent('gunner', v(i, 0, 10), 'alpha'));
    const os = Array.from({ length: 5 }, (_, i) => agent('gunner', v(i, 0, -10), 'omega'));
    // Everybody overdue, OMEGA's a bit more.
    as.forEach((a, i) => ((a.tac.urgent = false), (a.tac.nextThink = -1 + i * 0.01)));
    os.forEach((a, i) => ((a.tac.urgent = false), (a.tac.nextThink = -2 + i * 0.01)));
    const served = { alpha: 0, omega: 0 };
    for (let f = 0; f < 4; f++) {
      ctx.time = f / 60;
      const before = [...as, ...os].map((a) => a.decided);
      Squad.updateAll(sched, [
        { squad: A, ctx, agents: as },
        { squad: O, ctx, agents: os },
      ]);
      const now = [...as, ...os].map((a) => a.decided);
      const n = now.reduce((s, x, i) => s + x - before[i], 0);
      expect(n).toBeLessThanOrEqual(sched.maxPerFrame);
      served.alpha += as.reduce((s, a) => s + a.decided, 0) - before.slice(0, 4).reduce((s, x) => s + x, 0);
      served.omega += os.reduce((s, a) => s + a.decided, 0) - before.slice(4).reduce((s, x) => s + x, 0);
    }
    // The first two frames go to OMEGA (more overdue), then ALPHA is served: all nine within 3 frames.
    expect(served.omega).toBe(5);
    expect(served.alpha).toBe(4);
    expect(sched.stats.maxThinks).toBe(sched.maxPerFrame);
  });
});
